/**
 * Rate limiting for SyncBoard public demo.
 *
 * Identifies users by their OAuth token hash (or pairingId for Penpot relay),
 * not by IP. This makes rate limiting immune to VPN cycling — an attacker
 * cycling IPs gets nowhere because each request requires a valid token,
 * and getting one requires user-interactive OAuth.
 *
 * Fallback to IP only when no token/pairingId is present (covers edge cases
 * like the first request before OAuth completes).
 *
 * Three tiers:
 *   1. Global catch-all (Edge Middleware) — per-IP at the edge
 *   2. Per-endpoint (this module) — per-token/per-pairingId
 *   3. Global daily backstop — total sync ops across all users
 *
 * Backend auto-detection:
 *   - If UPSTASH_REDIS_REST_URL is set → use @upstash/ratelimit (Redis)
 *   - Otherwise → use in-memory Map (persistent infra only)
 */

import crypto from "crypto";
import { NextResponse } from "next/server";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // unix ms timestamp when the window resets
}

export interface RateLimitConfig {
  limit: number;
  window: number; // seconds
}

interface MultiWindowConfig {
  windows: RateLimitConfig[];
}

export type Plan = "community";

export interface PlanConfig {
  figmaPerMin: number;
  figmaPerDay: number;
  relayPerMin: number;
  relayPerHour: number;
  relayPerDay: number;
  updateImagePerMin: number;
  ablyTokenPerMin: number;
  globalSyncsPerDay: number;
  globalBandwidthMbPerDay: number;
  maxCompanionPairs: number;
}

// ─── Community plan defaults ─────────────────────────────────────────────

const COMMUNITY_PLAN: PlanConfig = {
  figmaPerMin: envInt("RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN", 5),
  figmaPerDay: envInt("RATE_LIMIT_COMMUNITY_FIGMA_PER_DAY", 50),
  relayPerMin: envInt("RATE_LIMIT_COMMUNITY_RELAY_PER_MIN", 5),
  relayPerHour: envInt("RATE_LIMIT_COMMUNITY_RELAY_PER_HOUR", 30),
  relayPerDay: envInt("RATE_LIMIT_COMMUNITY_RELAY_PER_DAY", 100),
  updateImagePerMin: envInt("RATE_LIMIT_COMMUNITY_UPDATE_IMAGE_PER_MIN", 10),
  ablyTokenPerMin: envInt("RATE_LIMIT_COMMUNITY_ABLY_TOKEN_PER_MIN", 5),
  globalSyncsPerDay: envInt("RATE_LIMIT_COMMUNITY_GLOBAL_SYNCS_PER_DAY", 500),
  globalBandwidthMbPerDay: envInt("RATE_LIMIT_COMMUNITY_GLOBAL_BANDWIDTH_MB_PER_DAY", 500),
  maxCompanionPairs: envInt("RATE_LIMIT_COMMUNITY_MAX_COMPANION_PAIRS", 1),
};

function getPlan(): Plan {
  return "community";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

/** Hash a token or pairing ID into a short, stable rate-limit key prefix. */
function hashId(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex").substring(0, 16);
}

/**
 * Extract a Bearer token from the Authorization header.
 * Returns null if absent or malformed.
 */
export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

// ─── Identifier extractors per endpoint ─────────────────────────────────────

type IdentifierExtractor = (request: Request) => Promise<string | null> | string | null;

const IDENTIFIER_EXTRACTORS: Record<string, IdentifierExtractor> = {
  // Figma endpoints: use the Bearer token from Authorization header
  "figma:render": (req) => {
    const token = extractBearerToken(req) || new URL(req.url).searchParams.get("token");
    return token ? `tok:${hashId(token)}` : null;
  },
  "figma:render-batch": (req) => {
    const token = extractBearerToken(req);
    return token ? `tok:${hashId(token)}` : null;
  },
  "figma:node-info": (req) => {
    const token = extractBearerToken(req);
    return token ? `tok:${hashId(token)}` : null;
  },
  // Miro update-image: miroToken is in the JSON body; clone to avoid consuming it
  "miro:update-image": async (req) => {
    const cloned = req.clone();
    try {
      const body = await cloned.json();
      const token = body.miroToken;
      return token ? `tok:${hashId(token)}` : null;
    } catch {
      return null;
    }
  },
  // Relay request: pairingId in the JSON body
  "relay:request": async (req) => {
    const cloned = req.clone();
    try {
      const body = await cloned.json();
      return body.pairingId ? `relay:${hashId(body.pairingId)}` : null;
    } catch {
      return null;
    }
  },
  // Relay result: requestId in the JSON body (called by companion plugin, already paired)
  "relay:result": async (req) => {
    const cloned = req.clone();
    try {
      const body = await cloned.json();
      return body.requestId ? `relay:${hashId(body.requestId)}` : null;
    } catch {
      return null;
    }
  },
  // Ably token: pairingId in body (POST) or query param (GET)
  "ably:token": (req) => {
    // Can't easily parse body in GET vs POST without reading, so try both
    try {
      const url = new URL(req.url);
      const pid = url.searchParams.get("pairingId");
      if (pid) return `pairing:${hashId(pid)}`;
    } catch {}
    // For POST, the handler reads the body — we use pairingId there too
    // Since we can't read the body without consuming it, fall back to IP
    // for the rate limit key. This is fine — ably/token is already tight at 5/min.
    return null;
  },
};

// ─── Rate limit configs per endpoint ────────────────────────────────────────

const ENDPOINT_LIMITS: Record<string, RateLimitConfig | MultiWindowConfig> = {
  "figma:render": { limit: COMMUNITY_PLAN.figmaPerMin, window: 60 },
  "figma:render-batch": { limit: COMMUNITY_PLAN.figmaPerMin, window: 60 },
  "figma:node-info": { limit: COMMUNITY_PLAN.figmaPerMin, window: 60 },
  "relay:request": {
    windows: [
      { limit: COMMUNITY_PLAN.relayPerMin, window: 60 },
      { limit: COMMUNITY_PLAN.relayPerHour, window: 3600 },
      { limit: COMMUNITY_PLAN.relayPerDay, window: 86400 },
    ],
  },
  "relay:result": { limit: COMMUNITY_PLAN.relayPerMin, window: 60 },
  "miro:update-image": { limit: COMMUNITY_PLAN.updateImagePerMin, window: 60 },
  "ably:token": { limit: COMMUNITY_PLAN.ablyTokenPerMin, window: 60 },
};

// ─── Backend abstraction ───────────────────────────────────────────────────

interface RateLimiterBackend {
  check(identifier: string, config: RateLimitConfig): Promise<RateLimitResult>;
}

/** In-memory fixed-window rate limiter for persistent infra (Docker/VPS/ECS). */
class InMemoryBackend implements RateLimiterBackend {
  private store = new Map<string, { count: number; resetAt: number }>();
  private cleanupInterval = 60_000;
  private lastCleanup = 0;

  private cleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) return;
    this.lastCleanup = now;
    for (const [key, entry] of this.store) {
      if (now > entry.resetAt) this.store.delete(key);
    }
  }

  async check(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
    this.cleanup();
    const now = Date.now();
    const windowMs = config.window * 1000;
    const key = `${identifier}:${config.limit}:${config.window}`;
    let entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      this.store.set(key, entry);
      return { success: true, limit: config.limit, remaining: config.limit - 1, reset: entry.resetAt };
    }

    entry.count++;
    if (entry.count > config.limit) {
      return { success: false, limit: config.limit, remaining: 0, reset: entry.resetAt };
    }

    return { success: true, limit: config.limit, remaining: config.limit - entry.count, reset: entry.resetAt };
  }
}

/** Redis-backed sliding-window rate limiter via @upstash/ratelimit. */
class RedisBackend implements RateLimiterBackend {
  private instances = new Map<string, any>();
  private initPromise: Promise<void> | null = null;
  private initialized = false;

  private async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        const { Ratelimit } = await import("@upstash/ratelimit");
        const { Redis } = await import("@upstash/redis");
        const redis = Redis.fromEnv();
        for (const [, cfg] of Object.entries(ENDPOINT_LIMITS)) {
          if ("limit" in cfg && "window" in cfg && typeof cfg.window === "number") {
            const label = `${cfg.limit}req_${cfg.window}s`;
            if (!this.instances.has(label)) {
              this.instances.set(
                label,
                new Ratelimit({
                  redis,
                  limiter: Ratelimit.slidingWindow(cfg.limit, `${cfg.window} s`),
                  analytics: false,
                  prefix: `syncboard:rl:${getPlan()}`,
                })
              );
            }
          } else if ("windows" in cfg) {
            for (const w of cfg.windows) {
              const label = `${w.limit}req_${w.window}s`;
              if (!this.instances.has(label)) {
                this.instances.set(
                  label,
                  new Ratelimit({
                    redis,
                    limiter: Ratelimit.slidingWindow(w.limit, `${w.window} s`),
                    analytics: false,
                    prefix: `syncboard:rl:${getPlan()}`,
                  })
                );
              }
            }
          }
        }
        this.initialized = true;
      } catch (e) {
        console.warn("[rate-limit] Failed to init Redis backend:", e);
      }
    })();
    await this.initPromise;
  }

  async check(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
    await this.init();
    const label = `${config.limit}req_${config.window}s`;
    const instance = this.instances.get(label);
    if (!instance) {
      return { success: true, limit: config.limit, remaining: config.limit, reset: Date.now() + config.window * 1000 };
    }
    const result = await instance.limit(`${getPlan()}:${identifier}`);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  }
}

// ─── Singleton backend ─────────────────────────────────────────────────────

let backendPromise: Promise<RateLimiterBackend | null> | null = null;

async function getBackend(): Promise<RateLimiterBackend | null> {
  if (backendPromise) return backendPromise;

  backendPromise = (async (): Promise<RateLimiterBackend | null> => {
    if (process.env.RATE_LIMIT_ENABLED === "false") return null;

    const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

    if (hasRedis) {
      try {
        const backend = new RedisBackend();
        await backend.check("healthcheck", { limit: 1, window: 1 });
        return backend;
      } catch (e) {
        console.warn("[rate-limit] Redis backend failed, falling back to in-memory:", e);
      }
    }

    const isVercel = !!process.env.VERCEL;
    if (isVercel && !hasRedis) {
      console.warn(
        "[rate-limit] Running on Vercel without UPSTASH_REDIS_REST_URL configured. " +
          "Rate limiting is disabled. Set RATE_LIMIT_ENABLED=false to silence this warning."
      );
      return null;
    }

    return new InMemoryBackend();
  })();

  return backendPromise;
}

// ─── withRateLimit HOF ─────────────────────────────────────────────────────

type RouteHandler = (request: Request, ...args: any[]) => Promise<NextResponse>;

export interface WithRateLimitOptions {
  /** Endpoint group identifier, e.g. "figma:render" */
  endpoint: string;
}

/**
 * Wraps a route handler with rate limiting.
 *
 * Identifies callers by their OAuth token hash (or pairingId for relay),
 * not by IP. This prevents VPN cycling attacks — each request requires
 * a valid token obtained via user-interactive OAuth.
 *
 * Falls back to client IP only when no token/pairingId is present.
 *
 * Usage:
 *   export const GET = withRateLimit({ endpoint: "figma:render" })(handler);
 */
export function withRateLimit(opts: WithRateLimitOptions) {
  return function wrap(handler: RouteHandler): RouteHandler {
    return async function rateLimitedHandler(request: Request, ...args: any[]): Promise<NextResponse> {
      const backend = await getBackend();
      if (!backend) {
        return handler(request, ...args);
      }

      // Determine the rate-limit identifier: prefer token/pairingId over IP
      const extractor = IDENTIFIER_EXTRACTORS[opts.endpoint];
      let identifier: string | null = null;
      if (extractor) {
        try {
          const extracted = await extractor(request);
          if (extracted) identifier = extracted;
        } catch {
          // Fall through to IP fallback
        }
      }
      if (!identifier) {
        identifier = `ip:${clientIp(request)}`;
      }

      const configs = ENDPOINT_LIMITS[opts.endpoint];
      if (!configs) {
        return handler(request, ...args);
      }

      // Single window
      if ("limit" in configs && "window" in configs && typeof configs.window === "number") {
        const result = await backend.check(`${opts.endpoint}:${identifier}`, configs);
        if (!result.success) {
          return rateLimitResponse(result);
        }
      }

      // Multi-window (relay: 5/min + 30/hour + 100/day)
      if ("windows" in configs) {
        const results = await Promise.all(
          configs.windows.map((w) => backend.check(`${opts.endpoint}:${identifier}`, w))
        );
        const failed = results.find((r) => !r.success);
        if (failed) {
          return rateLimitResponse(failed);
        }
      }

      return handler(request, ...args);
    };
  };
}

function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
  return NextResponse.json(
    {
      error: "rate_limit_exceeded",
      limit: result.limit,
      remaining: 0,
      reset: result.reset,
      plan: getPlan(),
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfter)),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.reset),
      },
    }
  );
}

// ─── Global daily backstop ─────────────────────────────────────────────────

/**
 * Global daily counter across all users — a hard ceiling preventing
 * free-tier budget exhaustion regardless of how many tokens or IPs
 * are cycled through.
 */
export async function checkGlobalDailyBackstop(
  counterKey: string,
  maxPerDay: number
): Promise<{ allowed: boolean; remaining: number }> {
  const backend = await getBackend();
  if (!backend) {
    return { allowed: true, remaining: Infinity };
  }
  const config: RateLimitConfig = { limit: maxPerDay, window: 86400 };
  const result = await backend.check(`global:${counterKey}`, config);
  return {
    allowed: result.success,
    remaining: result.remaining,
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { clientIp, getPlan, COMMUNITY_PLAN };
export type { RouteHandler };

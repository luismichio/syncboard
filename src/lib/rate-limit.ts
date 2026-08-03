/**
 * Rate limiting for SyncingBoard public demo.
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
import type { Ratelimit } from "@upstash/ratelimit";
import { incrementGlobalSyncCount } from "@/lib/relayRedis";

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
  relayResponsePerMin: number;
  relaySessionPerMin: number;
  updateImagePerMin: number;
  ablyTokenPerMin: number;
  oauthRefreshPerMin: number;
  oauthStoreGetPerMin: number;
  oauthStorePostPerMin: number;
  oauthCallbackPerMin: number;
  relayExportPerMin: number;
  relayExportPerDay: number;
  globalSyncsPerDay: number;
}

// ─── Community plan defaults ─────────────────────────────────────────────

const COMMUNITY_PLAN: PlanConfig = {
  figmaPerMin: envInt("RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN", 5),
  figmaPerDay: envInt("RATE_LIMIT_COMMUNITY_FIGMA_PER_DAY", 50),
  relayPerMin: envInt("RATE_LIMIT_COMMUNITY_RELAY_PER_MIN", 5),
  relayPerHour: envInt("RATE_LIMIT_COMMUNITY_RELAY_PER_HOUR", 30),
  relayPerDay: envInt("RATE_LIMIT_COMMUNITY_RELAY_PER_DAY", 100),
  relayResponsePerMin: envInt("RATE_LIMIT_COMMUNITY_RELAY_RESPONSE_PER_MIN", 20),
  relaySessionPerMin: envInt("RATE_LIMIT_COMMUNITY_RELAY_SESSION_PER_MIN", 4),
  updateImagePerMin: envInt("RATE_LIMIT_COMMUNITY_UPDATE_IMAGE_PER_MIN", 10),
  ablyTokenPerMin: envInt("RATE_LIMIT_COMMUNITY_ABLY_TOKEN_PER_MIN", 5),
  oauthRefreshPerMin: envInt("RATE_LIMIT_COMMUNITY_OAUTH_REFRESH_PER_MIN", 3),
  oauthStoreGetPerMin: envInt("RATE_LIMIT_COMMUNITY_OAUTH_STORE_GET_PER_MIN", 40),
  oauthStorePostPerMin: envInt("RATE_LIMIT_COMMUNITY_OAUTH_STORE_POST_PER_MIN", 12),
  oauthCallbackPerMin: envInt("RATE_LIMIT_COMMUNITY_OAUTH_CALLBACK_PER_MIN", 20),
  relayExportPerMin: envInt("RATE_LIMIT_COMMUNITY_RELAY_EXPORT_PER_MIN", 2),
  relayExportPerDay: envInt("RATE_LIMIT_COMMUNITY_RELAY_EXPORT_PER_DAY", 20),
  globalSyncsPerDay: envInt("RATE_LIMIT_COMMUNITY_GLOBAL_SYNCS_PER_DAY", 500),
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
    // Token is header-only; the route handler rejects query-string tokens and
    // warns against them, so the limiter must not accept them as identifiers.
    const token = extractBearerToken(req);
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
  // Miro update-image: token is sent in Authorization header
  "miro:update-image": (req) => {
    const token = extractBearerToken(req);
    return token ? `tok:${hashId(token)}` : null;
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
  // Relay result: pairingId is validated against the server-side request binding.
  "relay:result": async (req) => {
    const cloned = req.clone();
    try {
      const body: unknown = await cloned.json();
      if (!body || typeof body !== 'object') return null;
      const pairingId = (body as Record<string, unknown>).pairingId;
      return typeof pairingId === 'string' && pairingId
        ? `relay:${hashId(pairingId)}`
        : null;
    } catch {
      return null;
    }
  },
  // Relay export: same pairing key as relay:request, but a separate counter so
  // the stricter export budget is enforced independently of selections.
  "relay:export": async (req) => {
    const cloned = req.clone();
    try {
      const body: unknown = await cloned.json();
      if (!body || typeof body !== 'object') return null;
      const pairingId = (body as Record<string, unknown>).pairingId;
      return typeof pairingId === 'string' && pairingId
        ? `relay:${hashId(pairingId)}`
        : null;
    } catch {
      return null;
    }
  },
  // Relay response: requestId in query string
  "relay:response": (req) => {
    try {
      const url = new URL(req.url);
      const requestId = url.searchParams.get("requestId");
      return requestId ? `relay:${hashId(requestId)}` : null;
    } catch {
      return null;
    }
  },
  // Relay session: unique Miro relay-session ID in the JSON body.
  "relay:session": async (req) => {
    const cloned = req.clone();
    try {
      const body: unknown = await cloned.json();
      if (!body || typeof body !== 'object') return null;
      const sessionId = (body as Record<string, unknown>).sessionId;
      return typeof sessionId === 'string' && sessionId
        ? `session:${hashId(sessionId)}`
        : null;
    } catch {
      return null;
    }
  },
  // OAuth refresh: refresh token is intentionally header-only.
  "oauth:refresh": (req) => {
    const refreshToken = req.headers.get("X-Refresh-Token")?.trim();
    return refreshToken ? `refresh:${hashId(refreshToken)}` : null;
  },
  // OAuth store polling: state in query string
  "oauth:store:get": (req) => {
    try {
      const url = new URL(req.url);
      const state = url.searchParams.get("state");
      return state ? `oauth:${hashId(state)}` : null;
    } catch {
      return null;
    }
  },
  // OAuth store write: state in request body
  "oauth:store:post": async (req) => {
    const cloned = req.clone();
    try {
      const body = await cloned.json();
      return body.state ? `oauth:${hashId(String(body.state))}` : null;
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
  "figma:render": {
    windows: [
      { limit: COMMUNITY_PLAN.figmaPerMin, window: 60 },
      { limit: COMMUNITY_PLAN.figmaPerDay, window: 86_400 },
    ],
  },
  "figma:render-batch": {
    windows: [
      { limit: COMMUNITY_PLAN.figmaPerMin, window: 60 },
      { limit: COMMUNITY_PLAN.figmaPerDay, window: 86_400 },
    ],
  },
  "figma:node-info": {
    windows: [
      { limit: COMMUNITY_PLAN.figmaPerMin, window: 60 },
      { limit: COMMUNITY_PLAN.figmaPerDay, window: 86_400 },
    ],
  },
  // Penpot/Figma relay exports are the costlier Ably + Redis + payload path;
  // keep them on a stricter budget than lightweight selections.
  "relay:export": {
    windows: [
      { limit: COMMUNITY_PLAN.relayExportPerMin, window: 60 },
      { limit: COMMUNITY_PLAN.relayExportPerDay, window: 86_400 },
    ],
  },
  // OAuth provider redirect callbacks: conservative IP-keyed window.
  // The provider redirect carries no Authorization header, and the state
  // cookie is single-use, so an IP window is the practical abuse bound.
  "oauth:callback": { limit: COMMUNITY_PLAN.oauthCallbackPerMin, window: 60 },
  "relay:request": {
    windows: [
      { limit: COMMUNITY_PLAN.relayPerMin, window: 60 },
      { limit: COMMUNITY_PLAN.relayPerHour, window: 3_600 },
      { limit: COMMUNITY_PLAN.relayPerDay, window: 86_400 },
    ],
  },
  "relay:result": { limit: COMMUNITY_PLAN.relayPerMin, window: 60 },
  "relay:response": { limit: COMMUNITY_PLAN.relayResponsePerMin, window: 60 },
  "relay:session": { limit: COMMUNITY_PLAN.relaySessionPerMin, window: 60 },
"relay:status": { limit: 60, window: 60 },
  "oauth:refresh": { limit: COMMUNITY_PLAN.oauthRefreshPerMin, window: 60 },
  "oauth:store:get": { limit: COMMUNITY_PLAN.oauthStoreGetPerMin, window: 60 },
  "oauth:store:post": { limit: COMMUNITY_PLAN.oauthStorePostPerMin, window: 60 },
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
  private instances = new Map<string, Ratelimit>();
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
                  prefix: `syncingboard:rl:${getPlan()}`,
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
                    prefix: `syncingboard:rl:${getPlan()}`,
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

type RouteHandler = (request: Request, ...args: unknown[]) => Promise<NextResponse>;

const GLOBAL_SYNC_ENDPOINTS = new Set<string>([
  "figma:render",
  "figma:render-batch",
  "miro:update-image",
]);

export interface WithRateLimitOptions {
  /** Endpoint group identifier, e.g. "figma:render" */
  endpoint: string;
  /**
   * Skip rate limiting entirely for requests matching this predicate.
   * Used to scope a stricter sub-budget to a subset of traffic (e.g. relay
   * exports only) while the base endpoint budget still covers everything.
   */
  skipWhen?: (request: Request) => boolean | Promise<boolean>;
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
    return async function rateLimitedHandler(request: Request, ...args: unknown[]): Promise<NextResponse> {
      if (opts.skipWhen) {
        const skip = await opts.skipWhen(request);
        if (skip) {
          return handler(request, ...args);
        }
      }

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

      // Track the tightest window for success-path X-RateLimit-* headers so
      // clients can throttle proactively instead of only learning about limits
      // from a 429.
      let successResult: RateLimitResult | null = null;

      // Single window
      if ("limit" in configs && "window" in configs && typeof configs.window === "number") {
        const result = await backend.check(`${opts.endpoint}:${identifier}`, configs);
        if (!result.success) {
          return rateLimitResponse(result);
        }
        successResult = result;
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
        successResult = results.reduce((a, b) =>
          a.remaining < b.remaining ? a : b
        );
      }

      // ── Global daily resource backstop ─────────────────────────────
      // Count only render/update work. OAuth polling, token issuance, node
      // lookups, and relay response bookkeeping remain endpoint-limited but do
      // not consume the shared sync-resource budget.
      if (GLOBAL_SYNC_ENDPOINTS.has(opts.endpoint)) {
        const globalResult = await checkGlobalDailyBackstop(
          "syncs",
          COMMUNITY_PLAN.globalSyncsPerDay
        );
        if (!globalResult.allowed) {
          return rateLimitResponse({
            success: false,
            limit: COMMUNITY_PLAN.globalSyncsPerDay,
            remaining: 0,
            reset: globalResult.reset,
          });
        }
        // Best-effort display counter for /api/relay/status (mirrors the backstop).
        await incrementGlobalSyncCount().catch(() => undefined);
        successResult = successResult ?? {
          success: true,
          limit: COMMUNITY_PLAN.globalSyncsPerDay,
          remaining: globalResult.remaining,
          reset: globalResult.reset,
        };
      }

      const response = await handler(request, ...args);
      if (response && successResult) {
        response.headers.set("X-RateLimit-Limit", String(successResult.limit));
        response.headers.set("X-RateLimit-Remaining", String(Math.max(0, successResult.remaining)));
        response.headers.set("X-RateLimit-Reset", String(successResult.reset));
      }
      return response;
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
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const backend = await getBackend();
  if (!backend) {
    return { allowed: true, remaining: Infinity, reset: Date.now() + 86_400_000 };
  }
  const config: RateLimitConfig = { limit: maxPerDay, window: 86400 };
  const result = await backend.check(`global:${counterKey}`, config);
  return {
    allowed: result.success,
    remaining: result.remaining,
    reset: result.reset,
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { clientIp, getPlan, COMMUNITY_PLAN };
export type { RouteHandler };

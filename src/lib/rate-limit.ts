/**
 * Rate limiting for SyncBoard public demo.
 *
 * Three tiers:
 *   1. Global catch-all (Edge Middleware) — 60 req/min per IP
 *   2. Per-endpoint (this module) — fine-grained limits per route
 *   3. Global daily backstop — total sync ops across all IPs
 *
 * Backend auto-detection:
 *   - If UPSTASH_REDIS_REST_URL is set → use @upstash/ratelimit (Redis)
 *   - Otherwise → use in-memory Map (persistent infra only; on Vercel serverless
 *     without Redis, rate limiting logs a warning and disables)
 */

import { NextResponse } from "next/server";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // unix ms timestamp when the window resets
}

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window in seconds */
  window: number;
}

export interface MultiWindowConfig {
  windows: RateLimitConfig[];
}

export type Plan = "demo";

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

// ─── Demo plan defaults ─────────────────────────────────────────────────────

const DEMO_PLAN: PlanConfig = {
  figmaPerMin: envInt("RATE_LIMIT_DEMO_FIGMA_PER_MIN", 5),
  figmaPerDay: envInt("RATE_LIMIT_DEMO_FIGMA_PER_DAY", 50),
  relayPerMin: envInt("RATE_LIMIT_DEMO_RELAY_PER_MIN", 5),
  relayPerHour: envInt("RATE_LIMIT_DEMO_RELAY_PER_HOUR", 30),
  relayPerDay: envInt("RATE_LIMIT_DEMO_RELAY_PER_DAY", 100),
  updateImagePerMin: envInt("RATE_LIMIT_DEMO_UPDATE_IMAGE_PER_MIN", 10),
  ablyTokenPerMin: envInt("RATE_LIMIT_DEMO_ABLY_TOKEN_PER_MIN", 5),
  globalSyncsPerDay: envInt("RATE_LIMIT_DEMO_GLOBAL_SYNCS_PER_DAY", 500),
  globalBandwidthMbPerDay: envInt("RATE_LIMIT_DEMO_GLOBAL_BANDWIDTH_MB_PER_DAY", 500),
  maxCompanionPairs: envInt("RATE_LIMIT_DEMO_MAX_COMPANION_PAIRS", 1),
};

function getPlan(): "demo" {
  return "demo";
}

// ─── Helper ─────────────────────────────────────────────────────────────────

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

// ─── Rate limiters per endpoint ────────────────────────────────────────────

const ENDPOINT_LIMITS: Record<string, RateLimitConfig | MultiWindowConfig> = {
  "figma:render": { limit: DEMO_PLAN.figmaPerMin, window: 60 },
  "figma:render-batch": { limit: DEMO_PLAN.figmaPerMin, window: 60 },
  "figma:node-info": { limit: DEMO_PLAN.figmaPerMin, window: 60 },
  "relay:request": {
    windows: [
      { limit: DEMO_PLAN.relayPerMin, window: 60 },
      { limit: DEMO_PLAN.relayPerHour, window: 3600 },
      { limit: DEMO_PLAN.relayPerDay, window: 86400 },
    ],
  },
  "relay:result": { limit: DEMO_PLAN.relayPerMin, window: 60 },
  "miro:update-image": { limit: DEMO_PLAN.updateImagePerMin, window: 60 },
  "ably:token": { limit: DEMO_PLAN.ablyTokenPerMin, window: 60 },
};

// ─── Backend abstraction ───────────────────────────────────────────────────

interface RateLimiterBackend {
  check(identifier: string, config: RateLimitConfig): Promise<RateLimitResult>;
}

/** In-memory fixed-window rate limiter for persistent infra (Docker/VPS/ECS). */
class InMemoryBackend implements RateLimiterBackend {
  private store = new Map<string, { count: number; resetAt: number }>();
  private cleanupInterval = 60_000; // clean expired every 60s
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
        // Pre-create common instances
        for (const [key, cfg] of Object.entries(ENDPOINT_LIMITS)) {
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
      // Fallback: allow if limiter not available
      return { success: true, limit: config.limit, remaining: config.limit, reset: Date.now() + config.window * 1000 };
    }
    // Prefix identifier with plan for isolation
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
    // If explicitly disabled, skip
    if (process.env.RATE_LIMIT_ENABLED === "false") return null;

    const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

    if (hasRedis) {
      try {
        const backend = new RedisBackend();
        // Warm up the backend (import + pre-create instances)
        await backend.check("healthcheck", { limit: 1, window: 1 });
        return backend;
      } catch (e) {
        console.warn("[rate-limit] Redis backend failed, falling back to in-memory:", e);
      }
    }

    // Check if we're on Vercel serverless (no Redis available means in-memory is useless)
    const isVercel = !!process.env.VERCEL;
    if (isVercel && !hasRedis) {
      console.warn(
        "[rate-limit] Running on Vercel without UPSTASH_REDIS_REST_URL configured. " +
          "Rate limiting is disabled. Set RATE_LIMIT_ENABLED=false to silence this warning, " +
          "or configure Upstash Redis to enable rate limiting."
      );
      return null;
    }

    // On persistent infra, in-memory works fine
    return new InMemoryBackend();
  })();

  return backendPromise;
}

// ─── checkRateLimit (single window) ────────────────────────────────────────

async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult | null> {
  const backend = await getBackend();
  if (!backend) {
    // Rate limiting disabled
    return null;
  }
  return backend.check(identifier, config);
}

// ─── withRateLimit HOF ─────────────────────────────────────────────────────

type RouteHandler = (request: Request, ...args: any[]) => Promise<NextResponse>;

export interface WithRateLimitOptions {
  /** Endpoint group identifier, e.g. "figma:render" */
  endpoint: string;
}

/**
 * Wraps a route handler with per-IP rate limiting.
 *
 * Usage:
 *   export const GET = withRateLimit({ endpoint: "figma:render" })(handler);
 *   export const POST = withRateLimit({ endpoint: "relay:request" })(handler);
 */
export function withRateLimit(opts: WithRateLimitOptions) {
  return function wrap(handler: RouteHandler): RouteHandler {
    return async function rateLimitedHandler(request: Request, ...args: any[]): Promise<NextResponse> {
      // Check if enabled
      const backend = await getBackend();
      if (!backend) {
        return handler(request, ...args);
      }

      const ip = clientIp(request);
      const configs = ENDPOINT_LIMITS[opts.endpoint];
      if (!configs) {
        return handler(request, ...args);
      }

      // Single window
      if ("limit" in configs && "window" in configs && typeof configs.window === "number") {
        const result = await backend.check(`${opts.endpoint}:${ip}`, configs);
        if (!result.success) {
          return rateLimitResponse(result);
        }
      }

      // Multi-window (e.g., relay: 5/min + 30/hour + 100/day)
      if ("windows" in configs) {
        const results = await Promise.all(
          configs.windows.map((w) => backend.check(`${opts.endpoint}:${ip}`, w))
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
 * Global daily counter across all IPs — a hard ceiling that prevents
 * the entire free-tier budget from being consumed by any number of users.
 *
 * Uses a distinct key namespace ("global") so it doesn't interfere with
 * per-IP limits.
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
  // Use a fixed global identifier (not per-IP) so all users share the same counter
  const result = await backend.check(`global:${counterKey}`, config);
  return {
    allowed: result.success,
    remaining: result.remaining,
  };
}

// ─── Client IP helper (for middleware) ─────────────────────────────────────

export { clientIp, getPlan, DEMO_PLAN };
export type { RouteHandler };

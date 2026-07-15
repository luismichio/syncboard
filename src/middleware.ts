/**
 * Edge middleware for global IP-based rate limiting catch-all.
 *
 * Intercepts all `/api/*` requests before they reach the serverless function.
 * Returns 429 from the edge (no function invocation consumed) when the
 * global per-IP limit is exceeded.
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to be set.
 * If Redis is not configured, the middleware passes all requests through
 * (the per-endpoint withRateLimit() HOF can still enforce limits in-function).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const GLOBAL_CATCH_ALL_LIMIT = 60; // requests per minute per IP
const GLOBAL_CATCH_ALL_WINDOW = 60; // seconds

export async function middleware(request: NextRequest) {
  // Only intercept API routes
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Skip if rate limiting is explicitly disabled
  if (process.env.RATE_LIMIT_ENABLED === "false") {
    return NextResponse.next();
  }

  // Skip docs API (static, no cost)
  if (
    request.nextUrl.pathname.startsWith("/api/docs/")
  ) {
    return NextResponse.next();
  }

  // Check if Redis is available (required for edge runtime)
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return NextResponse.next();
  }

  try {
    const { Ratelimit } = await import("@upstash/ratelimit");
    const { Redis } = await import("@upstash/redis");

    const redis = Redis.fromEnv();
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(GLOBAL_CATCH_ALL_LIMIT, `${GLOBAL_CATCH_ALL_WINDOW} s`),
      analytics: false,
      prefix: "syncboard:rl:global",
    });

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    const { success, limit, remaining, reset } = await ratelimit.limit(`ip:${ip}`);

    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: "rate_limit_exceeded",
          limit,
          remaining: 0,
          reset,
          plan: "community",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, retryAfter)),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(reset),
          },
        }
      );
    }
  } catch (e) {
    // If rate limiting fails (e.g., Redis unreachable), allow the request
    console.warn("[middleware] Rate limiting check failed, allowing request:", e);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

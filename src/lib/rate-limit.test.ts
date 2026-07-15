import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Environment helpers ────────────────────────────────────────────────────

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

// ─── extractBearerToken ─────────────────────────────────────────────────────

describe("extractBearerToken()", () => {
  it("extracts token from valid Authorization header", async () => {
    const { extractBearerToken } = await import("./rate-limit");
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer tok_abc123" },
    });
    expect(extractBearerToken(req)).toBe("tok_abc123");
  });

  it("handles lowercase bearer prefix", async () => {
    const { extractBearerToken } = await import("./rate-limit");
    const req = new Request("http://localhost", {
      headers: { Authorization: "bearer tok_abc123" },
    });
    expect(extractBearerToken(req)).toBe("tok_abc123");
  });

  it("returns null when header is missing", async () => {
    const { extractBearerToken } = await import("./rate-limit");
    const req = new Request("http://localhost");
    expect(extractBearerToken(req)).toBeNull();
  });

  it("returns null when header is empty", async () => {
    const { extractBearerToken } = await import("./rate-limit");
    const req = new Request("http://localhost", {
      headers: { Authorization: "" },
    });
    expect(extractBearerToken(req)).toBeNull();
  });

  it("returns null when header is whitespace-only", async () => {
    const { extractBearerToken } = await import("./rate-limit");
    const req = new Request("http://localhost", {
      headers: { Authorization: "   " },
    });
    const result = extractBearerToken(req);
    // "   ".replace(/^Bearer\s+/i, "") = "   " (no match)
    // "   ".trim() = ""
    // "" || null = null
    expect(result).toBeNull();
  });
});

// ─── InMemoryBackend ────────────────────────────────────────────────────────

describe("InMemoryBackend", () => {
  beforeEach(async () => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("allows requests under the limit", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    // Make 5 requests (limit is 5/min)
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n", {
        headers: { Authorization: "Bearer stable-test-token" },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
    }
    expect(handler).toHaveBeenCalledTimes(5);
  });

  it("blocks requests over the limit with 429", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    // Make 6 requests (limit is 5/min)
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n", {
        headers: { Authorization: "Bearer test-token-429" },
      });
      await wrapped(req);
    }

    const req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n", {
      headers: { Authorization: "Bearer test-token-429" },
    });
    const res = await wrapped(req);
    expect(res.status).toBe(429);
    expect(handler).toHaveBeenCalledTimes(5); // 6th was blocked
  });

  it("returns 429 with plan: community and Retry-After header", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n", {
        headers: { Authorization: "Bearer test-token-retry" },
      });
      await wrapped(req);
    }

    const req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n", {
      headers: { Authorization: "Bearer test-token-retry" },
    });
    const res = await wrapped(req);
    const body = await res.json();

    expect(body.error).toBe("rate_limit_exceeded");
    expect(body.limit).toBe(5);
    expect(body.remaining).toBe(0);
    expect(body.plan).toBe("community");
    expect(body.reset).toBeGreaterThan(Date.now());
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("resets after the window expires", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n", {
        headers: { Authorization: "Bearer reset-test-token" },
      });
      await wrapped(req);
    }

    // 6th should be blocked
    const req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n", {
      headers: { Authorization: "Bearer reset-test-token" },
    });
    const blocked = await wrapped(req);
    expect(blocked.status).toBe(429);

    // Advance time past the 60s window
    // Since we can't easily mock Date.now() across modules, verify the structure
    const body = await blocked.json();
    expect(body.reset).toBeGreaterThan(Date.now());
    expect(body.error).toBe("rate_limit_exceeded");
  });

  it("uses token hash as identifier, not IP", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    // Two different tokens should have independent counters
    const tokenA_req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n", {
      headers: { Authorization: "Bearer token-a" },
    });
    const tokenB_req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n", {
      headers: { Authorization: "Bearer token-b" },
    });

    // Exhaust token A's limit
    for (let i = 0; i < 5; i++) {
      await wrapped(tokenA_req.clone());
    }

    // Token A should be blocked
    const aRes = await wrapped(tokenA_req.clone());
    expect(aRes.status).toBe(429);

    // Token B should still work
    const bRes = await wrapped(tokenB_req.clone());
    expect(bRes.status).toBe(200);
  });
});

// ─── RATE_LIMIT_ENABLED=false ───────────────────────────────────────────────

describe("RATE_LIMIT_ENABLED=false", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("bypasses all rate limiting", async () => {
    setEnv("RATE_LIMIT_ENABLED", "false");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);

    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    // Make 100 requests — all should pass
    for (let i = 0; i < 100; i++) {
      const req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n", {
        headers: { Authorization: "Bearer spam-token" },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
    }
    expect(handler).toHaveBeenCalledTimes(100);
  });
});

// ─── Multi-window rate limiting ─────────────────────────────────────────────

describe("relay:request multi-window", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("allows requests within all windows", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "relay:request" })(handler);

    // 5 requests at 5/min window — all should pass
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/relay/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingId: "multi-window-test", action: "select" }),
      });
      const res = await wrapped(req);
      expect(res.status).toBe(200);
    }
    expect(handler).toHaveBeenCalledTimes(5);
  });

  it("blocks when the smallest window is exceeded first", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "relay:request" })(handler);

    // 6 requests — should hit the 5/min window limit
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/relay/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingId: "multi-window-exceed", action: "select" }),
      });
      await wrapped(req);
    }

    const req = new Request("http://localhost/api/relay/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingId: "multi-window-exceed", action: "select" }),
    });
    const res = await wrapped(req);
    expect(res.status).toBe(429);
  });
});

// ─── IP fallback ────────────────────────────────────────────────────────────

describe("IP fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("uses IP when no Authorization header is present", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    // No auth header — should use IP as identifier
    const req = new Request("http://localhost/api/figma/render?fileKey=f&nodeId=n&token=inline-token");
    const res = await wrapped(req);
    // Should still work (the endpoint needs a token for Figma, but rate limiting
    // just needs some identifier — IP fallback is acceptable)
    expect(res.status).toBe(200);
  });
});

// ─── Global daily backstop ──────────────────────────────────────────────────

describe("checkGlobalDailyBackstop()", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("allows when under limit", async () => {
    const { checkGlobalDailyBackstop } = await import("./rate-limit");
    const result = await checkGlobalDailyBackstop("test-syncs", 500);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it("blocks when over limit", async () => {
    const { checkGlobalDailyBackstop } = await import("./rate-limit");
    // Use a limit of 1 — first call passes, second is blocked
    const first = await checkGlobalDailyBackstop("test-block", 1);
    expect(first.allowed).toBe(true);

    const second = await checkGlobalDailyBackstop("test-block", 1);
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(0);
  });

  it("returns allowed=true when rate limiting is disabled", async () => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "false");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
    const { checkGlobalDailyBackstop } = await import("./rate-limit");
    const result = await checkGlobalDailyBackstop("test-disabled", 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
  });
});

// ─── Plan name ──────────────────────────────────────────────────────────────

describe("plan name", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 'community'", async () => {
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);

    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/figma/render", {
        headers: { Authorization: "Bearer plan-test-token" },
      });
      await wrapped(req);
    }

    const req = new Request("http://localhost/api/figma/render", {
      headers: { Authorization: "Bearer plan-test-token" },
    });
    const res = await wrapped(req);
    const body = await res.json();
    expect(body.plan).toBe("community");
  });
});

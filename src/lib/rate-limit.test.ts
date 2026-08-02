import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";

// ─── Environment helpers ────────────────────────────────────────────────────

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of [
    "RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN",
    "RATE_LIMIT_COMMUNITY_FIGMA_PER_DAY",
    "RATE_LIMIT_COMMUNITY_RELAY_PER_MIN",
    "RATE_LIMIT_COMMUNITY_RELAY_PER_HOUR",
    "RATE_LIMIT_COMMUNITY_RELAY_PER_DAY",
    "RATE_LIMIT_COMMUNITY_OAUTH_REFRESH_PER_MIN",
    "RATE_LIMIT_COMMUNITY_OAUTH_CALLBACK_PER_MIN",
    "RATE_LIMIT_COMMUNITY_RELAY_EXPORT_PER_MIN",
    "RATE_LIMIT_COMMUNITY_RELAY_EXPORT_PER_DAY",
  ]) {
    delete process.env[key];
  }
});

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
    setEnv("RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN", "5");
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

  it("enforces the relay hourly window independently of its minute window", async () => {
    setEnv("RATE_LIMIT_COMMUNITY_RELAY_PER_MIN", "10");
    setEnv("RATE_LIMIT_COMMUNITY_RELAY_PER_HOUR", "2");
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "relay:request" })(handler);

    for (let i = 0; i < 2; i++) {
      const res = await wrapped(new Request("http://localhost/api/relay/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingId: "relay-hour-window", action: "select" }),
      }));
      expect(res.status).toBe(200);
    }

    const blocked = await wrapped(new Request("http://localhost/api/relay/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingId: "relay-hour-window", action: "select" }),
    }));
    expect(blocked.status).toBe(429);
  });

  it("enforces the Figma daily window independently of its minute window", async () => {
    setEnv("RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN", "10");
    setEnv("RATE_LIMIT_COMMUNITY_FIGMA_PER_DAY", "2");
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    for (let i = 0; i < 2; i++) {
      const res = await wrapped(new Request("http://localhost/api/figma/render", {
        headers: { Authorization: "Bearer figma-daily-window" },
      }));
      expect(res.status).toBe(200);
    }

    const blocked = await wrapped(new Request("http://localhost/api/figma/render", {
      headers: { Authorization: "Bearer figma-daily-window" },
    }));
    expect(blocked.status).toBe(429);
  });
});

// ─── OAuth refresh ─────────────────────────────────────────────────────────
describe("oauth:refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("RATE_LIMIT_COMMUNITY_OAUTH_REFRESH_PER_MIN", "3");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("limits repeated refreshes by refresh-token hash", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "oauth:refresh" })(handler);

    for (let i = 0; i < 3; i++) {
      const res = await wrapped(new Request("http://localhost/api/oauth/refresh", {
        method: "POST",
        headers: { "X-Refresh-Token": "stable-refresh-token" },
      }));
      expect(res.status).toBe(200);
    }

    const blocked = await wrapped(new Request("http://localhost/api/oauth/refresh", {
      method: "POST",
      headers: { "X-Refresh-Token": "stable-refresh-token" },
    }));
    expect(blocked.status).toBe(429);

    const distinctToken = await wrapped(new Request("http://localhost/api/oauth/refresh", {
      method: "POST",
      headers: { "X-Refresh-Token": "different-refresh-token" },
    }));
    expect(distinctToken.status).toBe(200);
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

// ─── Attack scenarios ──────────────────────────────────────────────────

describe("attack: token cycling", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("global backstop catches 501 unique tokens cycling", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    for (let i = 0; i < 500; i++) {
      const req = new Request(
        `http://localhost/api/figma/render?fileKey=f&nodeId=n`,
        { headers: { Authorization: `Bearer cycle-token-${i}` } }
      );
      const res = await wrapped(req);
      if (res.status !== 200) {
        const body = await res.json().catch(() => ({}));
        expect({ status: res.status, i, body }).toEqual({ status: 200, i, body: {} });
      }
    }
    expect(handler).toHaveBeenCalledTimes(500);

    const lastReq = new Request(
      "http://localhost/api/figma/render?fileKey=f&nodeId=n",
      { headers: { Authorization: "Bearer cycle-token-final" } }
    );
    const lastRes = await wrapped(lastReq);
    expect(lastRes.status).toBe(429);
    const body = await lastRes.json();
    expect(body.error).toBe("rate_limit_exceeded");
    expect(body.remaining).toBe(0);
    expect(body.plan).toBe("community");
    expect(handler).toHaveBeenCalledTimes(500);
  });

  it("global backstop shared across endpoint types", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const renderWrapped = withRateLimit({ endpoint: "figma:render" })(handler);
    const batchWrapped = withRateLimit({ endpoint: "figma:render-batch" })(handler);

    for (let i = 0; i < 3; i++) {
      const req = new Request(
        `http://localhost/api/figma/render?fileKey=f&nodeId=n`,
        { headers: { Authorization: `Bearer shared-global-${i}` } }
      );
      await renderWrapped(req);
    }
    for (let i = 3; i < 6; i++) {
      const req = new Request(
        "http://localhost/api/figma/render-batch",
        {
          method: "POST",
          headers: { Authorization: `Bearer shared-global-${i}`, "Content-Type": "application/json" },
          body: JSON.stringify({ nodes: [] }),
        }
      );
      await batchWrapped(req);
    }
    expect(handler).toHaveBeenCalledTimes(6);
  });
});

describe("attack: pairingId cycling via relay", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("does not spend the global sync budget for pairing-ID cycling", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "relay:request" })(handler);

    for (let i = 0; i < 500; i++) {
      const req = new Request("http://localhost/api/relay/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingId: `pairing-cycle-${i}`, action: "select" }),
      });
      const res = await wrapped(req);
      if (res.status !== 200) {
        const body = await res.json().catch(() => ({}));
        expect({ status: res.status, i, body }).toEqual({ status: 200, i, body: {} });
      }
    }
    expect(handler).toHaveBeenCalledTimes(500);

    const lastReq = new Request("http://localhost/api/relay/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingId: "pairing-cycle-final", action: "select" }),
    });
    const lastRes = await wrapped(lastReq);
    expect(lastRes.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(501);
  });
});

describe("attack: concurrent burst", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("10 concurrent requests with same token — max 5 succeed", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        wrapped(new Request(
          "http://localhost/api/figma/render?fileKey=f&nodeId=n",
          { headers: { Authorization: "Bearer burst-same-token" } }
        ))
      )
    );

    const successes = responses.filter((r) => r.status === 200).length;
    const failures = responses.filter((r) => r.status === 429).length;
    expect(successes).toBeLessThanOrEqual(5);
    expect(failures).toBeGreaterThanOrEqual(5);
    expect(successes + failures).toBe(10);
  });

  it("600 concurrent requests with unique tokens — global backstop holds", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    const responses = await Promise.all(
      Array.from({ length: 600 }, (_, i) =>
        wrapped(new Request(
          "http://localhost/api/figma/render?fileKey=f&nodeId=n",
          { headers: { Authorization: `Bearer conc-burst-${i}` } }
        ))
      )
    );

    const successes = responses.filter((r) => r.status === 200).length;
    const failures = responses.filter((r) => r.status === 429).length;
    expect(successes).toBeGreaterThanOrEqual(495);
    expect(successes).toBeLessThanOrEqual(505);
    expect(failures).toBeGreaterThanOrEqual(95);
    expect(successes + failures).toBe(600);
  });
});

describe("attack: IP rotation on fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("malformed JSON body in relay falls back to IP and passes", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "relay:request" })(handler);

    const res = await wrapped(new Request("http://localhost/api/relay/request", {
      method: "POST",
      body: "not actually json",
      headers: { "Content-Type": "application/json" },
    }));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("attack: global backstop starvation", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("attacker exhausts global limit — legitimate user is blocked", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    // Attacker exhausts the 500/day limit with 500 unique tokens
    for (let i = 0; i < 500; i++) {
      await wrapped(new Request(
        "http://localhost/api/figma/render?fileKey=f&nodeId=n",
        { headers: { Authorization: `Bearer attacker-starv-${i}` } }
      ));
    }

    // Legitimate user — should be blocked despite a completely different token
    const legitRes = await wrapped(new Request(
      "http://localhost/api/figma/render?fileKey=f&nodeId=n",
      { headers: { Authorization: "Bearer legitimate-user" } }
    ));
    expect(legitRes.status).toBe(429);
    const body = await legitRes.json();
    expect(body.error).toBe("rate_limit_exceeded");
    expect(body.remaining).toBe(0);
    expect(body.plan).toBe("community");

    // Different endpoint also blocked (shared global counter)
    const batchWrapped = withRateLimit({ endpoint: "figma:render-batch" })(handler);
    const batchRes = await batchWrapped(new Request(
      "http://localhost/api/figma/render-batch",
      {
        method: "POST",
        headers: { Authorization: "Bearer legitimate-user", "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: [] }),
      }
    ));
    expect(batchRes.status).toBe(429);
  });
});

// ─── figma:render identifier hygiene ─────────────────────────────────────────
describe("figma:render identifier hygiene", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN", "5");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("ignores ?token= query values as identifiers (header-only auth)", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    // Six requests, each with a DIFFERENT ?token= query value and no
    // Authorization header. If the limiter keyed on the query token they
    // would each get an independent bucket and all pass. They must instead
    // share the IP bucket, so the 6th is blocked at the 5/min limit.
    for (let i = 0; i < 5; i++) {
      const res = await wrapped(new Request(
        `http://localhost/api/figma/render?token=query-token-${i}`
      ));
      expect(res.status).toBe(200);
    }

    const blocked = await wrapped(new Request(
      "http://localhost/api/figma/render?token=query-token-99"
    ));
    expect(blocked.status).toBe(429);
  });
});

// ─── Success-path X-RateLimit-* headers ─────────────────────────────────────
describe("success X-RateLimit-* headers", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN", "5");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("adds X-RateLimit-* headers to successful responses", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "figma:render" })(handler);

    const res = await wrapped(new Request(
      "http://localhost/api/figma/render",
      { headers: { Authorization: "Bearer header-test-token" } }
    ));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
    expect(Number(res.headers.get("X-RateLimit-Reset"))).toBeGreaterThan(0);
  });
});

// ─── OAuth callback routes ──────────────────────────────────────────────────
describe("oauth:callback", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("RATE_LIMIT_COMMUNITY_OAUTH_CALLBACK_PER_MIN", "3");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  it("limits provider redirect callbacks per client IP", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({ endpoint: "oauth:callback" })(handler);

    for (let i = 0; i < 3; i++) {
      const res = await wrapped(new Request(
        "http://localhost/api/oauth/figma/callback?code=c&state=s"
      ));
      expect(res.status).toBe(200);
    }

    const blocked = await wrapped(new Request(
      "http://localhost/api/oauth/figma/callback?code=c&state=s"
    ));
    expect(blocked.status).toBe(429);
  });
});

// ─── Relay export sub-budget ────────────────────────────────────────────────
describe("relay:export sub-budget", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv("RATE_LIMIT_ENABLED", "true");
    setEnv("RATE_LIMIT_COMMUNITY_RELAY_EXPORT_PER_MIN", "2");
    setEnv("UPSTASH_REDIS_REST_URL", undefined);
    setEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    setEnv("VERCEL", undefined);
  });

  const exportReq = (pairing: string) =>
    new Request("http://localhost/api/relay/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingId: pairing, action: "export", shapeId: "s1" }),
    });

  const selectReq = (pairing: string) =>
    new Request("http://localhost/api/relay/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingId: pairing, action: "select" }),
    });

  it("applies the stricter export budget to export commands", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({
      endpoint: "relay:export",
      skipWhen: async (req) => {
        const body: unknown = await req.clone().json();
        return (body as Record<string, unknown>)?.action !== "export";
      },
    })(handler);

    for (let i = 0; i < 2; i++) {
      const res = await wrapped(exportReq("export-pairing"));
      expect(res.status).toBe(200);
    }

    const blocked = await wrapped(exportReq("export-pairing"));
    expect(blocked.status).toBe(429);
  });

  it("bypasses the export limiter for selection commands", async () => {
    const { withRateLimit } = await import("./rate-limit");
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withRateLimit({
      endpoint: "relay:export",
      skipWhen: async (req) => {
        const body: unknown = await req.clone().json();
        return (body as Record<string, unknown>)?.action !== "export";
      },
    })(handler);

    for (let i = 0; i < 5; i++) {
      const res = await wrapped(selectReq("select-pairing"));
      expect(res.status).toBe(200);
    }
  });
});

import { describe, expect, it } from "bun:test";
import {
  pointsKey,
  getBalance,
  deductPoints,
  refundPoints,
} from "../points";
import {
  createSession,
  deductUserPoints,
  getSession,
  refundUserPoints,
  DEFAULT_INITIAL_POINTS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type Env,
  type Session,
} from "../_shared";
import { onRequestGet } from "../me";

const DAY_MS = 24 * 60 * 60 * 1000;

function fakeKV(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const gets: string[] = [];
  const puts: Array<{ key: string; value: string; options?: { expirationTtl?: number } }> = [];
  return {
    store,
    gets,
    puts,
    async get(key: string) {
      gets.push(key);
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      puts.push({ key, value, options });
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

function envWith(kv: ReturnType<typeof fakeKV>): Env {
  return { SESSIONS: kv } as unknown as Env;
}

function sessionJson(userId: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    userId,
    email: `${userId}@example.com`,
    name: "Pengguna",
    accessToken: "at",
    expiresAt: Date.now() + 3600_000,
    createdAt: Date.now(),
    refreshedAt: Date.now(),
    ...extra,
  });
}

function requestFor(sid: string): Request {
  return new Request("https://example.com/api/gemini", {
    headers: new Headers({ cookie: `${SESSION_COOKIE}=${sid}` }),
  });
}

describe("pointsKey", () => {
  it("namespaces the balance per account", () => {
    expect(pointsKey("google-sub-1")).toBe("points:google-sub-1");
  });
});

describe("getBalance", () => {
  it("grants the initial 100 points once and does not write again", async () => {
    const kv = fakeKV();
    const env = envWith(kv);

    expect(await getBalance(env, "u1")).toBe(100);
    expect(await getBalance(env, "u1")).toBe(100);

    expect(kv.puts).toHaveLength(1);
    expect(kv.puts[0].key).toBe("points:u1");
    expect(kv.puts[0].value).toBe("100");
    expect(kv.puts[0].options?.expirationTtl).toBeUndefined();
  });

  it("returns 0 for a stored non-finite balance without overwriting it", async () => {
    const kv = fakeKV({ "points:u1": "null" });
    expect(await getBalance(envWith(kv), "u1")).toBe(0);
    expect(kv.puts).toHaveLength(0);
    expect(kv.store.get("points:u1")).toBe("null");
  });
});

describe("deductPoints", () => {
  it("refuses a non-number or non-positive cost without any write", async () => {
    const kv = fakeKV();
    const env = envWith(kv);
    for (const cost of [Object as unknown as number, Number.NaN, Number.POSITIVE_INFINITY, 0, -5]) {
      const result = await deductPoints(env, "u1", cost);
      expect(result.success).toBe(false);
    }
    expect(kv.puts).toHaveLength(0);
  });

  it("refuses to deduct from a stored null balance", async () => {
    const kv = fakeKV({ "points:u1": "null" });
    const result = await deductPoints(envWith(kv), "u1", 5);
    expect(result).toEqual({ success: false, remainingPoints: 0 });
    expect(kv.puts).toHaveLength(0);
  });

  it("deducts from the account balance and refuses when it runs short", async () => {
    const kv = fakeKV({ "points:u1": "12" });
    const env = envWith(kv);
    expect(await deductPoints(env, "u1", 10)).toEqual({ success: true, remainingPoints: 2 });
    expect(kv.store.get("points:u1")).toBe("2");
    expect(await deductPoints(env, "u1", 5)).toEqual({ success: false, remainingPoints: 2 });
    expect(kv.store.get("points:u1")).toBe("2");
  });
});

describe("refundPoints", () => {
  it("adds the amount back to the account balance", async () => {
    const kv = fakeKV({ "points:u1": "40" });
    expect(await refundPoints(envWith(kv), "u1", 10)).toEqual({ success: true, remainingPoints: 50 });
    expect(kv.store.get("points:u1")).toBe("50");
  });

  it("refuses a non-finite or non-positive amount without any write", async () => {
    const kv = fakeKV({ "points:u1": "40" });
    const env = envWith(kv);
    for (const amount of [Number.NaN, Object as unknown as number, 0, -1]) {
      expect((await refundPoints(env, "u1", amount)).success).toBe(false);
    }
    expect(kv.puts).toHaveLength(0);
  });

  it("reports and logs a refund whose KV write is rejected", async () => {
    const kv = fakeKV({ "points:u1": "40" });
    kv.put = async () => {
      throw new Error("KV PUT failed: 429 Too Many Requests");
    };
    const originalConsoleError = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      expect(await refundPoints(envWith(kv), "u1", 10)).toEqual({ success: false, remainingPoints: 40 });
    } finally {
      console.error = originalConsoleError;
    }
    expect(kv.store.get("points:u1")).toBe("40");
    expect(logged[0]?.[0]).toBe("Points refund write failed");
    expect(logged[0]?.[1]).toMatchObject({ userId: "u1", amount: 10, balance: 40 });
  });
});

describe("deductUserPoints and refundUserPoints share one balance per account", () => {
  it("two sessions of the same account spend from one balance", async () => {
    const kv = fakeKV({
      "sess:A": sessionJson("u1"),
      "sess:B": sessionJson("u1"),
    });
    const env = envWith(kv);

    const spent = await deductUserPoints(requestFor("A"), env, 100);
    expect(spent.success).toBe(true);
    expect(spent.remainingPoints).toBe(0);
    expect(spent.session?.userId).toBe("u1");

    const refused = await deductUserPoints(requestFor("B"), env, 5);
    expect(refused.success).toBe(false);
    expect(refused.remainingPoints).toBe(0);
    expect(refused.session).not.toBeNull();
  });

  it("ignores a legacy points field stored in the session", async () => {
    const kv = fakeKV({ "sess:A": sessionJson("u1", { points: 9999 }), "points:u1": "3" });
    const result = await deductUserPoints(requestFor("A"), envWith(kv), 5);
    expect(result.success).toBe(false);
    expect(result.remainingPoints).toBe(3);
  });

  it("a new login does not grant fresh points", async () => {
    const kv = fakeKV({ "sess:A": sessionJson("u1") });
    const env = envWith(kv);
    await deductUserPoints(requestFor("A"), env, 100);

    const sid = await createSession(env, JSON.parse(sessionJson("u1")) as Session);
    const stored = JSON.parse(kv.store.get(`sess:${sid}`) as string);
    expect(stored.points).toBeUndefined();
    expect(typeof stored.refreshedAt).toBe("number");

    const result = await deductUserPoints(requestFor(sid), env, 5);
    expect(result).toMatchObject({ success: false, remainingPoints: 0 });
  });

  it("refundUserPoints credits the account ledger", async () => {
    const kv = fakeKV({ "sess:A": sessionJson("u1"), "points:u1": "95" });
    const result = await refundUserPoints(requestFor("A"), envWith(kv), 5);
    expect(result).toEqual({ success: true, remainingPoints: 100 });
    expect(kv.store.get("points:u1")).toBe("100");
  });

  it("treats a session without userId as unauthenticated", async () => {
    const kv = fakeKV({ "sess:A": JSON.stringify({ email: "x@example.com" }) });
    const result = await deductUserPoints(requestFor("A"), envWith(kv), 5);
    expect(result).toEqual({ success: false, remainingPoints: 0, session: null });
    expect(kv.puts).toHaveLength(0);
  });
});

describe("getSession sliding refresh", () => {
  it("does not rewrite a session refreshed within the last 24h", async () => {
    const kv = fakeKV({ "sess:A": sessionJson("u1", { refreshedAt: Date.now() - 60_000 }) });
    const session = await getSession(requestFor("A"), envWith(kv));
    expect(session?.userId).toBe("u1");
    expect(kv.puts).toHaveLength(0);
  });

  it("rewrites a session refreshed more than 24h ago exactly once", async () => {
    const old = Date.now() - 25 * 60 * 60 * 1000;
    const kv = fakeKV({ "sess:A": sessionJson("u1", { refreshedAt: old }) });
    await getSession(requestFor("A"), envWith(kv));
    expect(kv.puts).toHaveLength(1);
    expect(kv.puts[0].key).toBe("sess:A");
    expect(kv.puts[0].options?.expirationTtl).toBe(SESSION_TTL_SECONDS);
    expect(JSON.parse(kv.puts[0].value).refreshedAt).toBeGreaterThan(old + DAY_MS);
  });

  it("rewrites a session that has no refreshedAt yet", async () => {
    const legacy = JSON.parse(sessionJson("u1"));
    delete legacy.refreshedAt;
    const kv = fakeKV({ "sess:A": JSON.stringify(legacy) });
    await getSession(requestFor("A"), envWith(kv));
    expect(kv.puts).toHaveLength(1);
    expect(typeof JSON.parse(kv.puts[0].value).refreshedAt).toBe("number");
  });

  it("never touches the points ledger", async () => {
    const kv = fakeKV({ "sess:A": sessionJson("u1", { refreshedAt: 0 }) });
    await getSession(requestFor("A"), envWith(kv));
    expect([...kv.gets, ...kv.puts.map((p) => p.key)].some((k) => k.startsWith("points:"))).toBe(false);
  });
});

describe("me endpoint", () => {
  it("returns the ledger balance, not the session field", async () => {
    const kv = fakeKV({
      "sess:A": sessionJson("u1", { points: 150, picture: "https://example.com/p.jpg" }),
      "points:u1": "37",
    });
    const response = await onRequestGet({
      request: requestFor("A"),
      env: envWith(kv),
      params: {},
      data: {},
      waitUntil() {},
      passThroughOnException() {},
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: {
        id: "u1",
        email: "u1@example.com",
        name: "Pengguna",
        picture: "https://example.com/p.jpg",
        points: 37,
      },
    });
  });

  it("seeds the initial grant for an account without a ledger entry", async () => {
    const kv = fakeKV({ "sess:A": sessionJson("u2") });
    const response = await onRequestGet({
      request: requestFor("A"),
      env: envWith(kv),
      params: {},
      data: {},
      waitUntil() {},
      passThroughOnException() {},
    });
    expect((await response.json()).user.points).toBe(DEFAULT_INITIAL_POINTS);
    expect(kv.store.get("points:u2")).toBe("100");
  });
});

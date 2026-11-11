import { describe, expect, it } from "bun:test";
import {
  ADMIN_POINTS,
  deductUserPoints,
  isAdminEmail,
  refundUserPoints,
  SESSION_COOKIE,
  type Env,
} from "../_shared";
import { onRequestGet } from "../me";

function fakeKV(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const puts: string[] = [];
  return {
    store,
    puts,
    async get(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async put(key: string, value: string) {
      puts.push(key);
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

function envWith(kv: ReturnType<typeof fakeKV>, adminEmails?: string): Env {
  return { SESSIONS: kv, ADMIN_EMAILS: adminEmails } as unknown as Env;
}

function sessionJson(userId: string, email: string): string {
  return JSON.stringify({
    userId,
    email,
    name: "Pengguna",
    createdAt: Date.now(),
    refreshedAt: Date.now(),
  });
}

function requestFor(sid: string): Request {
  return new Request("https://example.com/api/ai", {
    headers: new Headers({ cookie: `${SESSION_COOKIE}=${sid}` }),
  });
}

async function mePoints(env: Env): Promise<number> {
  const response = await onRequestGet({
    request: requestFor("A"),
    env,
    params: {},
    data: {},
    waitUntil() {},
    passThroughOnException() {},
  });
  expect(response.status).toBe(200);
  return (await response.json()).user.points;
}

describe("admin accounts have unlimited points", () => {
  it("an admin deduct leaves the ledger unchanged and returns 999999", async () => {
    const kv = fakeKV({ "sess:A": sessionJson("u1", "admin@example.com"), "points:u1": "3" });
    const result = await deductUserPoints(requestFor("A"), envWith(kv, "admin@example.com"), 50);
    expect(ADMIN_POINTS).toBe(999999);
    expect(result.success).toBe(true);
    expect(result.remainingPoints).toBe(999999);
    expect(result.session?.userId).toBe("u1");
    expect(kv.store.get("points:u1")).toBe("3");
    expect(kv.puts).toHaveLength(0);
  });

  it("matches a mixed-case, space-padded ADMIN_EMAILS list", async () => {
    const env = envWith(fakeKV(), "  other@example.com ,  Admin@Example.COM  ");
    expect(isAdminEmail(env, "admin@example.com")).toBe(true);
    expect(isAdminEmail(env, "ADMIN@example.com")).toBe(true);
    expect(isAdminEmail(env, "user@example.com")).toBe(false);
  });

  it("deducts a non-admin normally and refuses when the balance is low", async () => {
    const kv = fakeKV({ "sess:A": sessionJson("u2", "user@example.com"), "points:u2": "12" });
    const env = envWith(kv, "admin@example.com");
    expect(await deductUserPoints(requestFor("A"), env, 10)).toMatchObject({
      success: true,
      remainingPoints: 2,
    });
    expect(kv.store.get("points:u2")).toBe("2");
    expect(await deductUserPoints(requestFor("A"), env, 5)).toMatchObject({
      success: false,
      remainingPoints: 2,
    });
  });

  it("treats nobody as admin when ADMIN_EMAILS is missing or empty", async () => {
    for (const value of [undefined, "", "  ", " , "]) {
      const kv = fakeKV({ "sess:A": sessionJson("u1", "admin@example.com"), "points:u1": "3" });
      const env = envWith(kv, value);
      expect(isAdminEmail(env, "admin@example.com")).toBe(false);
      expect(await deductUserPoints(requestFor("A"), env, 5)).toMatchObject({
        success: false,
        remainingPoints: 3,
      });
    }
  });

  it("an admin refund leaves the ledger unchanged", async () => {
    const kv = fakeKV({ "sess:A": sessionJson("u1", "admin@example.com"), "points:u1": "3" });
    const result = await refundUserPoints(requestFor("A"), envWith(kv, "admin@example.com"), 5);
    expect(result).toEqual({ success: true, remainingPoints: 999999 });
    expect(kv.store.get("points:u1")).toBe("3");
    expect(kv.puts).toHaveLength(0);
  });

  it("me reports 999999 for an admin and the ledger balance for a non-admin", async () => {
    const adminKv = fakeKV({ "sess:A": sessionJson("u1", "admin@example.com"), "points:u1": "3" });
    expect(await mePoints(envWith(adminKv, "admin@example.com"))).toBe(999999);
    expect(adminKv.store.get("points:u1")).toBe("3");

    const userKv = fakeKV({ "sess:A": sessionJson("u2", "user@example.com"), "points:u2": "37" });
    expect(await mePoints(envWith(userKv, "admin@example.com"))).toBe(37);
  });
});

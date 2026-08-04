import { describe, expect, it, test, vi } from "vitest";
import type { Env } from "./_shared";
import {
  buildClearCookie,
  buildSessionCookie,
  consumeState,
  randomHex,
  randomToken,
  refundUserPoints,
  timingSafeEqual,
  isEmailAllowed,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  DEFAULT_INITIAL_POINTS,
} from "./_shared";

describe("buildClearCookie", () => {
  it("generates a clear cookie string without Secure flag when secure is false", () => {
    const result = buildClearCookie(false);
    expect(result).toBe("adaptiva_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  });

  it("generates a clear cookie string with Secure flag when secure is true", () => {
    const result = buildClearCookie(true);
    expect(result).toBe("adaptiva_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure");
  });
});

describe("buildSessionCookie", () => {
  it("should build a non-secure cookie correctly", () => {
    const cookie = buildSessionCookie("test-id-123", false);
    expect(cookie).toBe(`${SESSION_COOKIE}=test-id-123; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
  });

  it("should build a secure cookie correctly", () => {
    const cookie = buildSessionCookie("test-id-456", true);
    expect(cookie).toBe(`${SESSION_COOKIE}=test-id-456; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}; Secure`);
  });

  it("should URL encode the session ID", () => {
    const sessionId = "test/id with spaces=+!";
    const encodedId = encodeURIComponent(sessionId);
    const cookie = buildSessionCookie(sessionId, false);
    expect(cookie).toBe(`${SESSION_COOKIE}=${encodedId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
    expect(cookie).toContain(encodedId);
    expect(cookie).not.toContain("spaces=+!");
  });

  it("should handle empty session ID", () => {
    const cookie = buildSessionCookie("", false);
    expect(cookie).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
  });
});

describe("timingSafeEqual", () => {
  it("should return true for identical strings", () => {
    expect(timingSafeEqual("hello", "hello")).toBe(true);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("should return false for strings of different lengths", () => {
    expect(timingSafeEqual("hello", "helloworld")).toBe(false);
    expect(timingSafeEqual("hello", "")).toBe(false);
  });

  it("should return false for strings of same length but different content", () => {
    expect(timingSafeEqual("hello", "hellx")).toBe(false);
    expect(timingSafeEqual("abcde", "12345")).toBe(false);
  });

  it("should correctly compare unicode/special character strings", () => {
    expect(timingSafeEqual("🔐secret", "🔐secret")).toBe(true);
    expect(timingSafeEqual("🔐secret", "🔐secreX")).toBe(false);
  });
});

describe("randomHex", () => {
  it("should generate a 64-character string by default (32 bytes)", () => {
    const hex = randomHex();
    expect(hex.length).toBe(64);
  });

  it("should generate the correct length for a custom byte length", () => {
    const hex16 = randomHex(16);
    expect(hex16.length).toBe(32);

    const hex8 = randomHex(8);
    expect(hex8.length).toBe(16);
  });

  it("should contain only valid lowercase hexadecimal characters", () => {
    const hex = randomHex();
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });

  it("should return cryptographically random and unique values", () => {
    const hex1 = randomHex();
    const hex2 = randomHex();
    expect(hex1).not.toBe(hex2);
  });
});

describe("randomToken", () => {
  it("should generate a random string of the correct length", () => {
    const token = randomToken(32);
    expect(token.length).toBe(43);
  });

  it("should use a default length of 32 bytes", () => {
    const token = randomToken();
    expect(token.length).toBe(43);
  });

  it("should only contain URL-safe base64 characters", () => {
    const token = randomToken(64);
    expect(token).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
    expect(token).not.toContain("=");
  });

  it("should generate unique tokens", () => {
    const token1 = randomToken(32);
    const token2 = randomToken(32);
    expect(token1).not.toEqual(token2);
  });
});

describe("isEmailAllowed", () => {
  it("returns true if ALLOWED_EMAIL_DOMAINS is not set", () => {
    const env = {} as Env;
    expect(isEmailAllowed(env, "test@example.com")).toBe(true);
  });

  it("returns true if ALLOWED_EMAIL_DOMAINS is empty or just whitespace", () => {
    const env = { ALLOWED_EMAIL_DOMAINS: "   " } as Env;
    expect(isEmailAllowed(env, "test@example.com")).toBe(true);
  });

  it("returns true if allowed domains list parses to empty", () => {
    const env = { ALLOWED_EMAIL_DOMAINS: ", , ," } as Env;
    expect(isEmailAllowed(env, "test@example.com")).toBe(true);
  });

  it("returns true if email domain is in allowed list", () => {
    const env = { ALLOWED_EMAIL_DOMAINS: "example.com, test.org" } as Env;
    expect(isEmailAllowed(env, "user@example.com")).toBe(true);
    expect(isEmailAllowed(env, "user@test.org")).toBe(true);
  });

  it("returns false if email domain is not in allowed list", () => {
    const env = { ALLOWED_EMAIL_DOMAINS: "example.com" } as Env;
    expect(isEmailAllowed(env, "user@other.com")).toBe(false);
  });

  it("is case insensitive for both allowed list and email domain", () => {
    const env = { ALLOWED_EMAIL_DOMAINS: "ExAmPlE.cOm" } as Env;
    expect(isEmailAllowed(env, "user@example.com")).toBe(true);
    expect(isEmailAllowed(env, "user@EXAMPLE.COM")).toBe(true);
  });

  it("handles emails without a domain correctly", () => {
    const env = { ALLOWED_EMAIL_DOMAINS: "example.com" } as Env;
    expect(isEmailAllowed(env, "invalid-email")).toBe(false);
  });
});

describe("refundUserPoints", () => {
  it("should refund points successfully", async () => {
    const mockRequest = new Request("https://example.com", {
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=test-session-id`,
      }),
    });

    const mockEnv = {
      SESSIONS: {
        get: vi.fn().mockResolvedValue(JSON.stringify({ points: 100 })),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
      },
    } as unknown as Env;

    const result = await refundUserPoints(mockRequest, mockEnv, 50);

    expect(result).toEqual({ success: true, remainingPoints: 150 });
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("sess:test-session-id");
    expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
      "sess:test-session-id",
      JSON.stringify({ points: 150 }),
      expect.any(Object)
    );
  });

  it("should initialize points to DEFAULT_INITIAL_POINTS and refund if points are missing", async () => {
    const mockRequest = new Request("https://example.com", {
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=test-session-id`,
      }),
    });

    const mockEnv = {
      SESSIONS: {
        get: vi.fn().mockResolvedValue(JSON.stringify({})),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
      },
    } as unknown as Env;

    const result = await refundUserPoints(mockRequest, mockEnv, 50);

    expect(result).toEqual({ success: true, remainingPoints: DEFAULT_INITIAL_POINTS + 50 });
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("sess:test-session-id");
    expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
      "sess:test-session-id",
      JSON.stringify({ points: DEFAULT_INITIAL_POINTS + 50 }),
      expect.any(Object)
    );
  });

  it("should return success: false when no cookie is provided", async () => {
    const mockRequest = new Request("https://example.com");

    const mockEnv = {
      SESSIONS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as Env;

    const result = await refundUserPoints(mockRequest, mockEnv, 50);

    expect(result).toEqual({ success: false, remainingPoints: 0 });
    expect(mockEnv.SESSIONS.get).not.toHaveBeenCalled();
  });

  it("should return success: false when SESSIONS is undefined in env", async () => {
    const mockRequest = new Request("https://example.com", {
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=test-session-id`,
      }),
    });

    const mockEnv = {} as unknown as Env;

    const result = await refundUserPoints(mockRequest, mockEnv, 50);

    expect(result).toEqual({ success: false, remainingPoints: 0 });
  });

  it("should return success: false when session is not found in KV", async () => {
    const mockRequest = new Request("https://example.com", {
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=test-session-id`,
      }),
    });

    const mockEnv = {
      SESSIONS: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as Env;

    const result = await refundUserPoints(mockRequest, mockEnv, 50);

    expect(result).toEqual({ success: false, remainingPoints: 0 });
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("sess:test-session-id");
    expect(mockEnv.SESSIONS.put).not.toHaveBeenCalled();
  });

  it("should return success: false when session data is invalid JSON (error scenario)", async () => {
    const mockRequest = new Request("https://example.com", {
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=test-session-id`,
      }),
    });

    const mockEnv = {
      SESSIONS: {
        get: vi.fn().mockResolvedValue("invalid json"),
        put: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as Env;

    const result = await refundUserPoints(mockRequest, mockEnv, 50);

    expect(result).toEqual({ success: false, remainingPoints: 0 });
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("sess:test-session-id");
    expect(mockEnv.SESSIONS.put).not.toHaveBeenCalled();
  });
});

describe("consumeState", () => {
  it("returns true for a valid, recent state", async () => {
    const mockEnv = {
      SESSIONS: {
        get: vi.fn(async (key: string) => {
          if (key === "oauth_state:valid_state") {
            return JSON.stringify({ createdAt: Date.now() });
          }
          return null;
        }),
        delete: vi.fn(async () => {}),
        put: vi.fn(async () => {}),
      },
    } as unknown as Env;

    const result = await consumeState(mockEnv, "valid_state");
    expect(result).toBe(true);
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("oauth_state:valid_state");
    expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith("oauth_state:valid_state");
  });

  it("returns false when state is not found", async () => {
    const mockEnv = {
      SESSIONS: {
        get: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        put: vi.fn(async () => {}),
      },
    } as unknown as Env;

    const result = await consumeState(mockEnv, "missing_state");
    expect(result).toBe(false);
    expect(mockEnv.SESSIONS.delete).not.toHaveBeenCalled();
  });

  it("returns false for invalid JSON in KV store", async () => {
    const mockEnv = {
      SESSIONS: {
        get: vi.fn(async (key: string) => {
          if (key === "oauth_state:invalid_json_state") {
            return "{ invalid_json: true ";
          }
          return null;
        }),
        delete: vi.fn(async () => {}),
        put: vi.fn(async () => {}),
      },
    } as unknown as Env;

    const result = await consumeState(mockEnv, "invalid_json_state");
    expect(result).toBe(false);
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("oauth_state:invalid_json_state");
    expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith("oauth_state:invalid_json_state");
  });

  it("returns false when createdAt is not a number", async () => {
    const mockEnv = {
      SESSIONS: {
        get: vi.fn(async (key: string) => {
          if (key === "oauth_state:bad_created_at") {
            return JSON.stringify({ createdAt: "not_a_number" });
          }
          return null;
        }),
        delete: vi.fn(async () => {}),
        put: vi.fn(async () => {}),
      },
    } as unknown as Env;

    const result = await consumeState(mockEnv, "bad_created_at");
    expect(result).toBe(false);
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("oauth_state:bad_created_at");
    expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith("oauth_state:bad_created_at");
  });

  it("returns false for an expired state", async () => {
    const mockEnv = {
      SESSIONS: {
        get: vi.fn(async (key: string) => {
          if (key === "oauth_state:expired_state") {
            return JSON.stringify({ createdAt: Date.now() - 1200 * 1000 });
          }
          return null;
        }),
        delete: vi.fn(async () => {}),
        put: vi.fn(async () => {}),
      },
    } as unknown as Env;

    const result = await consumeState(mockEnv, "expired_state");
    expect(result).toBe(false);
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("oauth_state:expired_state");
    expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith("oauth_state:expired_state");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  buildClearCookie,
  randomToken,
  refundUserPoints,
  type Env,
  SESSION_COOKIE,
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

describe("randomToken", () => {
  it("should generate a random string of the correct length", () => {
    const token = randomToken(32);
    // 32 bytes = 43 chars in base64url (no padding)
    expect(token.length).toBe(43);
  });

  it("should use a default length of 32 bytes", () => {
    const token = randomToken();
    expect(token.length).toBe(43);
  });

  it("should only contain URL-safe base64 characters", () => {
    const token = randomToken(64);
    // base64url allows A-Z, a-z, 0-9, -, _
    // No padding = no trailing '='
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

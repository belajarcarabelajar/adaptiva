import { describe, expect, it, vi } from "vitest";
import { refundUserPoints, type Env, SESSION_COOKIE, DEFAULT_INITIAL_POINTS } from "./_shared";

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

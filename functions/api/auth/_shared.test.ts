import { expect, test, describe, mock } from "bun:test";
import { getSession, SESSION_COOKIE } from "./_shared";

describe("getSession", () => {
  test("returns null for invalid JSON in KV store", async () => {
    const mockRequest = new Request("https://example.com", {
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=invalid_json_sid`,
      }),
    });

    const mockEnv = {
      SESSIONS: {
        get: mock(async (key: string) => {
          if (key === "sess:invalid_json_sid") {
            return "invalid { json ] string"; // This will cause JSON.parse to throw
          }
          return null;
        }),
        put: mock(async () => {}),
        delete: mock(async () => {}),
      }
    };

    const session = await getSession(mockRequest, mockEnv as any);
    expect(session).toBeNull();
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("sess:invalid_json_sid");
  });

  test("returns session object for valid JSON in KV store", async () => {
    const validSession = {
      userId: "user-123",
      email: "test@example.com",
      name: "Test User",
      accessToken: "access_123",
      expiresAt: 1234567890,
      createdAt: 1234567000,
      points: 50,
    };

    const mockRequest = new Request("https://example.com", {
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=valid_sid`,
      }),
    });

    const mockEnv = {
      SESSIONS: {
        get: mock(async (key: string) => {
          if (key === "sess:valid_sid") {
            return JSON.stringify(validSession);
          }
          return null;
        }),
        put: mock(async () => {}),
        delete: mock(async () => {}),
      }
    };

    const session = await getSession(mockRequest, mockEnv as any);
    expect(session).toEqual(validSession);
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("sess:valid_sid");
    expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith("sess:valid_sid", JSON.stringify(validSession), expect.any(Object));
  });
});

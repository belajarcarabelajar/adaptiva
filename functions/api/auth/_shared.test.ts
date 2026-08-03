import { expect, test, describe, mock } from "bun:test";
import { consumeState } from "./_shared.js";
import type { Env } from "./_shared.js";

describe("consumeState", () => {


  test("returns true for a valid, recent state", async () => {
    const mockEnv = {
      SESSIONS: {
        get: mock(async (key: string) => {
          if (key === "oauth_state:valid_state") {
            return JSON.stringify({ createdAt: Date.now() });
          }
          return null;
        }),
        delete: mock(async () => {}),
        put: mock(async () => {})
      }
    } as unknown as Env;

    const result = await consumeState(mockEnv, "valid_state");
    expect(result).toBe(true);
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("oauth_state:valid_state");
    expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith("oauth_state:valid_state");
  });

  test("returns false when state is not found", async () => {
    const mockEnv = {
      SESSIONS: {
        get: mock(async () => null),
        delete: mock(async () => {}),
        put: mock(async () => {})
      }
    } as unknown as Env;

    const result = await consumeState(mockEnv, "missing_state");
    expect(result).toBe(false);
    expect(mockEnv.SESSIONS.delete).not.toHaveBeenCalled();
  });

  test("returns false for invalid JSON in KV store", async () => {
    const mockEnv = {
      SESSIONS: {
        get: mock(async (key: string) => {
          if (key === "oauth_state:invalid_json_state") {
            return "{ invalid_json: true ";
          }
          return null;
        }),
        delete: mock(async () => {}),
        put: mock(async () => {})
      }
    } as unknown as Env;

    const result = await consumeState(mockEnv, "invalid_json_state");
    expect(result).toBe(false);
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("oauth_state:invalid_json_state");
    expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith("oauth_state:invalid_json_state");
  });

  test("returns false when createdAt is not a number", async () => {
    const mockEnv = {
      SESSIONS: {
        get: mock(async (key: string) => {
          if (key === "oauth_state:bad_created_at") {
            return JSON.stringify({ createdAt: "not_a_number" });
          }
          return null;
        }),
        delete: mock(async () => {}),
        put: mock(async () => {})
      }
    } as unknown as Env;

    const result = await consumeState(mockEnv, "bad_created_at");
    expect(result).toBe(false);
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("oauth_state:bad_created_at");
    expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith("oauth_state:bad_created_at");
  });

  test("returns false for an expired state", async () => {
    const mockEnv = {
      SESSIONS: {
        get: mock(async (key: string) => {
          if (key === "oauth_state:expired_state") {
            // Expired state: Created 20 minutes ago
            return JSON.stringify({ createdAt: Date.now() - (1200 * 1000) });
          }
          return null;
        }),
        delete: mock(async () => {}),
        put: mock(async () => {})
      }
    } as unknown as Env;

    const result = await consumeState(mockEnv, "expired_state");
    expect(result).toBe(false);
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith("oauth_state:expired_state");
    expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith("oauth_state:expired_state");
  });
});

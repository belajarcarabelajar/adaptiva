import { describe, expect, it, vi } from "vitest";
import { onRequestGet, onRequestOptions } from "../me";
import { SESSION_COOKIE, DEFAULT_INITIAL_POINTS, type Env } from "../_shared";

describe("me route", () => {
  describe("onRequestOptions", () => {
    it("should return 204 with CORS headers", async () => {
      const mockRequest = new Request("https://example.com");
      const context = {
        request: mockRequest,
        env: {} as Env,
        params: {},
        data: {},
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const response = await onRequestOptions(context);
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
      expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    });
  });

  describe("onRequestGet", () => {
    it("should return 401 not_authenticated when no session exists", async () => {
      const mockRequest = new Request("https://example.com");
      const context = {
        request: mockRequest,
        env: {
          SESSIONS: {
            get: vi.fn(),
            put: vi.fn(),
            delete: vi.fn(),
          },
        } as unknown as Env,
        params: {},
        data: {},
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const response = await onRequestGet(context);
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body).toEqual({ error: "not_authenticated" });
    });

    // The balance comes from the account ledger (points:<userId>); a legacy
    // `points` field inside the session is ignored.
    function contextFor(entries: Record<string, string>) {
      const store = new Map(Object.entries(entries));
      const SESSIONS = {
        get: vi.fn(async (key: string) => store.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
          store.set(key, value);
        }),
        delete: vi.fn(),
      };
      const request = new Request("https://example.com", {
        headers: new Headers({ cookie: `${SESSION_COOKIE}=valid-session-id` }),
      });
      return {
        store,
        context: {
          request,
          env: { SESSIONS } as unknown as Env,
          params: {},
          data: {},
          waitUntil: vi.fn(),
          passThroughOnException: vi.fn(),
        },
      };
    }

    const baseSession = {
      userId: "user-123",
      email: "test@example.com",
      name: "Test User",
      picture: "http://example.com/pic.jpg",
      accessToken: "access-token",
      expiresAt: Date.now() + 10000,
      createdAt: Date.now(),
    };

    it("should return user data with the ledger balance when session exists", async () => {
      const { context, store } = contextFor({
        "sess:valid-session-id": JSON.stringify({ ...baseSession, points: 150 }),
        "points:user-123": "70",
      });

      const response = await onRequestGet(context);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toEqual({
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          picture: "http://example.com/pic.jpg",
          points: 70,
        },
      });

      expect(context.env.SESSIONS.get).toHaveBeenCalledWith("sess:valid-session-id");
      expect(store.get("points:user-123")).toBe("70");
    });

    it("should seed DEFAULT_INITIAL_POINTS when the account has no ledger entry", async () => {
      const { context, store } = contextFor({
        "sess:valid-session-id": JSON.stringify(baseSession),
      });

      const response = await onRequestGet(context);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.user.points).toBe(DEFAULT_INITIAL_POINTS);
      expect(store.get("points:user-123")).toBe(String(DEFAULT_INITIAL_POINTS));
    });
  });
});

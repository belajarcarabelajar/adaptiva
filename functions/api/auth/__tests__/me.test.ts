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

    it("should return user data when session exists", async () => {
      const mockRequest = new Request("https://example.com", {
        headers: new Headers({
          cookie: `${SESSION_COOKIE}=valid-session-id`,
        }),
      });

      const mockSession = {
        userId: "user-123",
        email: "test@example.com",
        name: "Test User",
        picture: "http://example.com/pic.jpg",
        points: 150,
        accessToken: "access-token",
        expiresAt: Date.now() + 10000,
        createdAt: Date.now(),
      };

      const context = {
        request: mockRequest,
        env: {
          SESSIONS: {
            get: vi.fn().mockResolvedValue(JSON.stringify(mockSession)),
            put: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn(),
          },
        } as unknown as Env,
        params: {},
        data: {},
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const response = await onRequestGet(context);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toEqual({
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          picture: "http://example.com/pic.jpg",
          points: 150,
        },
      });

      expect(context.env.SESSIONS.get).toHaveBeenCalledWith("sess:valid-session-id");
      expect(context.env.SESSIONS.put).toHaveBeenCalledWith(
        "sess:valid-session-id",
        JSON.stringify(mockSession),
        expect.any(Object)
      );
    });

    it("should default points to DEFAULT_INITIAL_POINTS when points are missing", async () => {
      const mockRequest = new Request("https://example.com", {
        headers: new Headers({
          cookie: `${SESSION_COOKIE}=valid-session-id`,
        }),
      });

      const mockSession = {
        userId: "user-123",
        email: "test@example.com",
        name: "Test User",
        picture: "http://example.com/pic.jpg",
        accessToken: "access-token",
        expiresAt: Date.now() + 10000,
        createdAt: Date.now(),
      };

      const context = {
        request: mockRequest,
        env: {
          SESSIONS: {
            get: vi.fn().mockResolvedValue(JSON.stringify(mockSession)),
            put: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn(),
          },
        } as unknown as Env,
        params: {},
        data: {},
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      };

      const response = await onRequestGet(context);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.user.points).toBe(DEFAULT_INITIAL_POINTS);

      expect(context.env.SESSIONS.put).toHaveBeenCalledWith(
        "sess:valid-session-id",
        JSON.stringify({ ...mockSession, points: DEFAULT_INITIAL_POINTS }),
        expect.any(Object)
      );
    });
  });
});

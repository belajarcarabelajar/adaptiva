import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { onRequestGet } from "../callback";
import type { Env } from "../_shared";

const originalFetch = global.fetch;
const STATE_COOKIE_HTTPS = "__Host-adaptiva_oauth_state";
const STATE_COOKIE_HTTP = "adaptiva_oauth_state";

const mockHappyFetch = () => {
  (global.fetch as any)
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        expires_in: 3600,
        id_token: "id",
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: "123",
        email: "user@example.com",
        email_verified: true,
        name: "User",
      }),
    });
};

describe("callback handler", () => {
  let mockEnv: Env;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockEnv = {
      GOOGLE_CLIENT_ID: "client_id",
      GOOGLE_CLIENT_SECRET: "client_secret",
      SESSIONS: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      } as any,
    };

    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  // Every https test request carries the browser-bound state cookie for state=valid.
  const createMockContext = (url: string, cookie: string | null = `${STATE_COOKIE_HTTPS}=valid`) => {
    return {
      request: new Request(url, cookie ? { headers: { cookie } } : undefined),
      env: mockEnv,
      params: {},
      data: {},
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as any;
  };

  it("should redirect with not_configured if env is missing", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback");
    ctx.env = {} as any; // Missing config

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?auth_error=not_configured");
  });

  it("should redirect if error param is present", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?error=access_denied");

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?auth_error=access_denied");
  });

  it("should redirect if missing code or state", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo");

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?auth_error=missing_code_or_state");
  });

  it("should redirect if state is invalid", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=invalid");

    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(null);

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?auth_error=invalid_or_expired_state");
  });

  it("should redirect if token exchange fails", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid");

    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));

    (global.fetch as any).mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue("exchange error"),
      status: 400,
    });

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?auth_error=token_exchange_failed");
  });

  it("should redirect if fetchUserInfo fails and fallback decode fails", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid");

    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "access",
          id_token: "invalid.id.token",
        }),
      }) // exchangeCode
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      }); // fetchUserInfo

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?auth_error=user_info_failed");
  });

  it("should redirect if email is not verified", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid");

    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "access",
          id_token: "id",
        }),
      }) // exchangeCode
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: "123",
          email: "user@example.com",
          email_verified: false,
        }),
      }); // fetchUserInfo

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?auth_error=email_not_verified");
  });

  it("should redirect if email domain is not allowed", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid");

    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));
    mockEnv.ALLOWED_EMAIL_DOMAINS = "allowed.com";

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "access",
          id_token: "id",
        }),
      }) // exchangeCode
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: "123",
          email: "user@notallowed.com",
          email_verified: true,
        }),
      }); // fetchUserInfo

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?auth_error=domain_not_allowed");
  });

  it("should handle happy path correctly", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid&next=/dashboard");

    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          id_token: "id",
        }),
      }) // exchangeCode
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: "123",
          email: "user@example.com",
          email_verified: true,
          name: "User",
        }),
      }); // fetchUserInfo

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("window.location.replace(\"/dashboard\")");

    const cookies = res.headers.get("Set-Cookie");
    expect(cookies).toContain("adaptiva_sess=");
    expect(cookies).toContain("HttpOnly");
  });

  it("should handle next parameter rejection for absolute URLs", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid&next=https://evil.com");

    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "access",
          id_token: "id",
        }),
      }) // exchangeCode
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: "123",
          email: "user@example.com",
          email_verified: true,
        }),
      }); // fetchUserInfo

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("window.location.replace(\"/\")"); // Sanitized to "/"
  });

  it("should handle next parameter rejection for backslash protocol-relative URLs (open redirect bypass)", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid&next=/\\evil.com");

    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "access",
          id_token: "id",
        }),
      }) // exchangeCode
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: "123",
          email: "user@example.com",
          email_verified: true,
        }),
      }); // fetchUserInfo

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("window.location.replace(\"/\")"); // Sanitized to "/"
  });

  it("should handle next parameter bypass attempts using path normalization (/.//evil.com)", async () => {
    // A payload like "/.//evil.com" can bypass naive URL constructor parsing because
    // the dummy origin remains localhost, but url.pathname becomes "//evil.com",
    // which acts as a protocol-relative redirect when rendered.
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid&next=/.//evil.com");

    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "access",
          id_token: "id",
        }),
      }) // exchangeCode
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: "123",
          email: "user@example.com",
          email_verified: true,
        }),
      }); // fetchUserInfo

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("window.location.replace(\"/evil.com\")"); // Normalized safely to a single slash /evil.com
  });

  it("should fallback to decoding id_token if fetchUserInfo fails but id_token is valid", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid");

    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));

    // Create a valid unsafe id_token payload
    const payload = btoa(JSON.stringify({
      sub: "123",
      email: "user@fallback.com",
      email_verified: true,
      name: "Fallback User",
    }));
    const idToken = `header.${payload}.signature`;

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "access",
          id_token: idToken,
        }),
      }) // exchangeCode
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      }); // fetchUserInfo fails

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("window.location.replace(\"/\")");
  });
  it("rejects a valid code and state when the browser has no state cookie (login CSRF)", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid", null);
    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));
    mockHappyFetch();

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/?auth_error=invalid_or_expired_state");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a state that differs from the state cookie", async () => {
    const ctx = createMockContext(
      "https://example.com/api/auth/callback?code=foo&state=attacker",
      `${STATE_COOKIE_HTTPS}=victim`,
    );
    mockEnv.SESSIONS.get = vi.fn().mockResolvedValue(JSON.stringify({ createdAt: Date.now() }));
    mockHappyFetch();

    const res = await onRequestGet(ctx) as Response;
    expect(res.headers.get("Location")).toBe("/?auth_error=invalid_or_expired_state");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears the state cookie on an error redirect", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?error=access_denied");

    const res = await onRequestGet(ctx) as Response;
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith(`${STATE_COOKIE_HTTPS}=;`));
    expect(cleared).toBeDefined();
    expect(cleared).toContain("Max-Age=0");
  });

  it("signs in with the state cookie, clears it, and stores no Google tokens", async () => {
    const ctx = createMockContext("https://example.com/api/auth/callback?code=foo&state=valid");
    mockHappyFetch();

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(200);

    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("adaptiva_sess="))).toBe(true);
    expect(setCookies.some((c) => c.startsWith(`${STATE_COOKIE_HTTPS}=;`) && c.includes("Max-Age=0"))).toBe(true);

    const puts = (mockEnv.SESSIONS.put as any).mock.calls as [string, string][];
    expect(puts.map(([key]) => key.split(":")[0])).toEqual(["sess"]);
    const stored = JSON.parse(puts[0][1]);
    expect(stored).not.toHaveProperty("accessToken");
    expect(stored).not.toHaveProperty("refreshToken");
    expect(puts[0][1]).not.toContain("access-secret");
    expect(puts[0][1]).not.toContain("refresh-secret");
    expect(stored).toMatchObject({ userId: "123", email: "user@example.com", name: "User" });
  });

  it("accepts the unprefixed state cookie on plain http (local dev)", async () => {
    const ctx = createMockContext(
      "http://localhost:3000/api/auth/callback?code=foo&state=devstate",
      `${STATE_COOKIE_HTTP}=devstate`,
    );
    mockHappyFetch();

    const res = await onRequestGet(ctx) as Response;
    expect(res.status).toBe(200);
  });
});

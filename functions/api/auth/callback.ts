// Pages Function: OAuth callback handler.
// - Verifies the CSRF state (one-shot, KV-backed).
// - Exchanges the authorization code for tokens.
// - Creates a server session in KV and sets an HttpOnly cookie.
// - Redirects to / (or to ?next=... if provided and same-origin).

import {
  buildClearCookie,
  buildSessionCookie,
  consumeState,
  createSession,
  decodeIdTokenUnsafe,
  exchangeCode,
  fetchUserInfo,
  getOrigin,
  isEmailAllowed,
  isHttps,
  redirectResponse,
  type Env,
  type PagesFunction,
  type Session,
} from "./_shared";

const SAFE_NEXT_PREFIX = "/";

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  // Reject protocol-relative and absolute URLs; only allow same-origin paths.
  if (raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return "/";
  if (!raw.startsWith(SAFE_NEXT_PREFIX)) return "/";
  return raw;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { env, request } = context;

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSIONS) {
      return redirectResponse("/?auth_error=not_configured");
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");
    const next = safeNext(url.searchParams.get("next"));

    if (errorParam) {
      return redirectResponse(`/?auth_error=${encodeURIComponent(errorParam)}`);
    }

    if (!code || !state) {
      return redirectResponse("/?auth_error=missing_code_or_state");
    }

    // One-shot, constant-time state check. consumeState deletes the key.
    if (!(await consumeState(env, state))) {
      return redirectResponse("/?auth_error=invalid_or_expired_state");
    }

    const origin = getOrigin(request, env);

    let tokens;
    try {
      tokens = await exchangeCode(origin, env, code);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "token exchange failed";
      console.error("OAuth token exchange error:", msg);
      return redirectResponse(`/?auth_error=${encodeURIComponent("token_exchange_failed")}`);
    }

    // Prefer userinfo endpoint (authoritative, server-fetched). Fall back to
    // id_token claims if userinfo fails for some reason.
    let user;
    try {
      user = await fetchUserInfo(tokens.access_token);
    } catch (e) {
      console.warn("fetchUserInfo failed, attempting decodeIdTokenUnsafe:", e);
      try {
        user = decodeIdTokenUnsafe(tokens.id_token);
      } catch (err) {
        console.error("decodeIdTokenUnsafe failed:", err);
        return redirectResponse("/?auth_error=user_info_failed");
      }
    }

    if (!user || !user.email || !user.email_verified) {
      return redirectResponse(`/?auth_error=${encodeURIComponent("email_not_verified")}`);
    }
    if (!isEmailAllowed(env, user.email)) {
      return redirectResponse(`/?auth_error=${encodeURIComponent("domain_not_allowed")}`);
    }

    const now = Date.now();
    const session: Session = {
      userId: user.sub || user.email,
      email: user.email,
      name: user.name || user.email,
      picture: user.picture,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: now + (tokens.expires_in || 3600) * 1000,
      createdAt: now,
    };

    const sid = await createSession(env, session);
    const cookie = buildSessionCookie(sid, isHttps(request, env));

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Logging in...</title>
</head>
<body>
  <p>Connecting to Adaptiva...</p>
  <script>
    window.location.replace(${JSON.stringify(next)});
  </script>
</body>
</html>`;

    const headers = new Headers({
      "content-type": "text/html; charset=utf-8",
      "Set-Cookie": cookie,
    });

    return new Response(html, { status: 200, headers });
  } catch (err) {
    console.error("Unhandled error in callback handler:", err);
    return redirectResponse("/?auth_error=unexpected_callback_error");
  }
};

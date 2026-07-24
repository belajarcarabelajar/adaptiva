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
    return new Response("Missing code or state", { status: 400 });
  }

  // One-shot, constant-time state check. consumeState deletes the key.
  if (!(await consumeState(env, state))) {
    return new Response("Invalid or expired state", { status: 400 });
  }

  const origin = getOrigin(request, env);

  let tokens;
  try {
    tokens = await exchangeCode(origin, env, code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "token exchange failed";
    return new Response(`OAuth error: ${msg}`, { status: 502 });
  }

  // Prefer userinfo endpoint (authoritative, server-fetched). Fall back to
  // id_token claims if userinfo fails for some reason.
  let user;
  try {
    user = await fetchUserInfo(tokens.access_token);
  } catch {
    user = decodeIdTokenUnsafe(tokens.id_token);
  }

  if (!user.email || !user.email_verified) {
    return redirectResponse(`/?auth_error=${encodeURIComponent("email_not_verified")}`);
  }
  if (!isEmailAllowed(env, user.email)) {
    return redirectResponse(`/?auth_error=${encodeURIComponent("domain_not_allowed")}`);
  }

  const now = Date.now();
  const session: Session = {
    userId: user.sub,
    email: user.email,
    name: user.name || user.email,
    picture: user.picture,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: now + tokens.expires_in * 1000,
    createdAt: now,
  };

  const sid = await createSession(env, session);
  const cookie = buildSessionCookie(sid, isHttps(request, env));

  return redirectResponse(next, 302, { "Set-Cookie": cookie });
};

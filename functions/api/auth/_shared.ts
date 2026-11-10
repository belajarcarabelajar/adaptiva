// Shared types and helpers for the OAuth + session Functions under
// functions/api/auth/. Kept in a sibling file (not nested under [[path]] etc.)
// so each auth Function can `import from "./_shared"` directly.
//
// The OAuth state lives only in a short-lived HttpOnly cookie (see
// buildStateCookie), which binds it to the browser that started the login.
//
// KV layout:
//   sess:<sessionId>        -> Session         TTL 2592000s (30 days, sliding)
//   points:<userId>         -> balance          no TTL (see ./points.ts)

import {
  DEFAULT_INITIAL_POINTS,
  deductPoints,
  refundPoints,
} from "./points";

export { DEFAULT_INITIAL_POINTS };

interface PagesContext<E = unknown> {
  request: Request;
  env: E;
  params: Record<string, string | string[]>;
  data: unknown;
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  next?(input?: Request | string): Promise<Response>;
}

type PagesFunction<E = unknown> = (
  context: PagesContext<E>,
) => Response | Promise<Response>;

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  // KV namespace bound as SESSIONS in wrangler.jsonc.
  SESSIONS: KVNamespace;
  // Optional: override in dev (e.g. http://localhost:3000) so the OAuth
  // redirect_uri matches the URL Google is configured to accept. Production
  // sets this automatically from request.url.
  AUTH_BASE_URL?: string;
  // Optional: restrict to specific domains for security. Empty = any.
  ALLOWED_EMAIL_DOMAINS?: string;
}

export interface Session {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: number;
  // Last time the sliding TTL was renewed (ms). The balance is not stored
  // here; legacy sessions may still carry an ignored `points` field.
  refreshedAt?: number;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export const SESSION_COOKIE = "adaptiva_sess";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const STATE_TTL_SECONDS = 600; // 10 min
export const STATE_COOKIE = "adaptiva_oauth_state";
// Renewing the TTL at most daily keeps KV writes off every request.
export const SESSION_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

// --- Crypto helpers ---

const hexTable = new Array(256);
for (let i = 0; i < 256; i++) {
  hexTable[i] = i.toString(16).padStart(2, "0");
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += hexTable[bytes[i]];
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    bin += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    );
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Cryptographically random hex string of the given byte length. */
export function randomHex(byteLength = 32): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

/** Cryptographically random base64url string (URL-safe, no padding). */
export function randomToken(byteLength = 32): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return bytesToBase64Url(buf);
}

/** Constant-time string compare. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Cookie helpers ---

export function parseCookies(request: Request | string | null | undefined): Record<string, string> {
  const header = typeof request === "string" ? request : request?.headers?.get("cookie");
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      // One malformed cookie from anywhere on the domain must not break auth.
    }
  }
  return out;
}

export function buildSessionCookie(sessionId: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookie(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

// __Host- forbids a Domain attribute, so a sibling subdomain cannot plant a
// state cookie. Browsers reject the prefix without Secure, hence plain http
// (local dev) falls back to the bare name.
export function stateCookieName(secure: boolean): string {
  return secure ? `__Host-${STATE_COOKIE}` : STATE_COOKIE;
}

export function buildStateCookie(state: string, secure: boolean): string {
  const parts = [
    `${stateCookieName(secure)}=${encodeURIComponent(state)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${STATE_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearStateCookie(secure: boolean): string {
  const parts = [
    `${stateCookieName(secure)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

// --- URL helpers ---

export function getOrigin(request: Request, env?: Env): string {
  if (env?.AUTH_BASE_URL) return env.AUTH_BASE_URL.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

export function getAllowedOrigin(request: Request, env?: Env): string {
  const originHeader = request.headers?.get("origin");
  const reqOrigin = new URL(request.url).origin;

  // If no origin header, assume same-origin request
  if (!originHeader) return reqOrigin;

  try {
    const originUrl = new URL(originHeader);

    // Exact match of the request URL's origin
    if (originHeader === reqOrigin) return originHeader;

    // Match the configured AUTH_BASE_URL if available
    if (env?.AUTH_BASE_URL) {
      try {
        const baseOrigin = new URL(env.AUTH_BASE_URL).origin;
        if (originHeader === baseOrigin) return originHeader;
      } catch {}
    }

    // Allow localhost/127.0.0.1 for local development
    if (originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1") {
      return originHeader;
    }

    // Default to the request's origin to prevent arbitrary reflection
    return reqOrigin;
  } catch {
    return reqOrigin;
  }
}

export function isHttps(request: Request, env?: Env): boolean {
  if (env?.AUTH_BASE_URL) return getOrigin(request, env).startsWith("https://");
  const proto =
    request.headers?.get("x-forwarded-proto") ||
    request.headers?.get("cf-visitor");
  if (proto && proto.includes("https")) return true;
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  return false;
}

// --- Session helpers ---

export async function getSession(
  request: Request,
  env: Env,
): Promise<Session | null> {
  const cookies = parseCookies(request);
  const sid = cookies[SESSION_COOKIE];
  if (!sid || !env.SESSIONS) return null;
  const raw = await env.SESSIONS.get(`sess:${sid}`);
  if (!raw) return null;
  let session: Session;
  try {
    session = JSON.parse(raw) as Session;
  } catch {
    return null;
  }
  const now = Date.now();
  const refreshedAt = session.refreshedAt;
  if (typeof refreshedAt !== "number" || now - refreshedAt > SESSION_REFRESH_INTERVAL_MS) {
    session.refreshedAt = now;
    await env.SESSIONS.put(`sess:${sid}`, JSON.stringify(session), {
      expirationTtl: SESSION_TTL_SECONDS,
    });
  }
  return session;
}

export async function createSession(
  env: Env,
  session: Session,
): Promise<string> {
  const sid = randomToken(32);
  const newSession: Session = { ...session, refreshedAt: Date.now() };
  await env.SESSIONS.put(`sess:${sid}`, JSON.stringify(newSession), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return sid;
}

/** Session behind the request cookie, or null when absent, corrupt, or without a userId. */
async function readAccountSession(
  request: Request,
  env: Env,
): Promise<Session | null> {
  const sid = parseCookies(request)[SESSION_COOKIE];
  if (!sid || !env.SESSIONS) return null;
  const raw = await env.SESSIONS.get(`sess:${sid}`);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    if (typeof session?.userId !== "string" || session.userId === "") return null;
    return session;
  } catch {
    return null;
  }
}

export async function deductUserPoints(
  request: Request,
  env: Env,
  cost: number,
): Promise<{
  success: boolean;
  remainingPoints: number;
  session: Session | null;
}> {
  const session = await readAccountSession(request, env);
  if (!session) return { success: false, remainingPoints: 0, session: null };
  const result = await deductPoints(env, session.userId, cost);
  return { ...result, session };
}

export async function refundUserPoints(
  request: Request,
  env: Env,
  amount: number,
): Promise<{ success: boolean; remainingPoints: number }> {
  const session = await readAccountSession(request, env);
  if (!session) return { success: false, remainingPoints: 0 };
  return refundPoints(env, session.userId, amount);
}

export async function deleteSession(request: Request, env: Env): Promise<void> {
  const cookies = parseCookies(request);
  const sid = cookies[SESSION_COOKIE];
  if (!sid || !env.SESSIONS) return;
  await env.SESSIONS.delete(`sess:${sid}`);
}

// --- CSRF state helpers ---

export function createState(): string {
  return randomToken(32);
}

/** True when the state query param matches the state cookie of this browser. */
export function stateMatchesCookie(request: Request, secure: boolean, state: string): boolean {
  const expected = parseCookies(request)[stateCookieName(secure)];
  if (!expected) return false;
  return timingSafeEqual(expected, state);
}

// --- Google API helpers ---

export function buildAuthorizeUrl(
  origin: string,
  clientId: string,
  state: string,
): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(
  origin: string,
  env: Env,
  code: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: `${origin}/api/auth/callback`,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

/**
 * Decode a Google ID token's payload WITHOUT verifying the signature.
 * The signature is implicitly verified by the token exchange endpoint
 * (oauth2.googleapis.com/token), which only returns id_token when the
 * authorization code is valid. Do not use this for ID tokens received
 * directly from the client.
 */
export function decodeIdTokenUnsafe(idToken: string): GoogleUserInfo {
  if (!idToken) throw new Error("Missing id_token");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed id_token");
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as GoogleUserInfo;
}

export async function fetchUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  return (await res.json()) as GoogleUserInfo;
}

export function isEmailAllowed(env: Env, email: string): boolean {
  const list = env.ALLOWED_EMAIL_DOMAINS?.trim();
  if (!list) return true;
  const allowed = list
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return allowed.includes(domain);
}

// --- Response helpers ---

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
  env?: Env,
): Response {
  const origin = getAllowedOrigin(request, env);
  const headers = new Headers({
    "content-type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    ...extraHeaders,
  });
  return new Response(JSON.stringify(body), { status, headers });
}

export function redirectResponse(
  location: string,
  status = 302,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers();
  headers.set("Location", location);
  for (const [k, v] of Object.entries(extraHeaders)) {
    headers.append(k, v);
  }
  return new Response(null, { status, headers });
}

export type { PagesContext, PagesFunction };

// Pages Function: pass-through proxy to the Google Gemini API.
//
// Why this exists: the official @google/genai SDK on the frontend is pointed at
// ${window.location.origin}/api/gemini (see apps/web/src/services/geminiService.ts).
// In production we can't expose GEMINI_API_KEY to the browser, so this Function
// terminates that path, injects the secret as the x-goog-api-key header, and
// forwards the request to Google's API.
//
// Configuration via Pages secrets / env:
//   GEMINI_API_KEY      (required)  - the real Google API key
//   GEMINI_API_BASE     (optional)  - override the upstream host, e.g. for staging
//   GEMINI_MODEL_DEFAULT(optional)  - default model hint, NOT used to rewrite URLs
//
// The SDK in the browser chooses the model per-call and constructs the URL
// (e.g. /v1beta/models/gemini-2.5-flash:generateContent). We forward whatever
// path the SDK gives us, so adding a new model on the frontend needs no
// change here.

// Self-contained context type so this file has no runtime dependencies on
// @cloudflare/workers-types. Mirrors the PagesFunction context shape.
interface PagesContext<E = unknown> {
  request: Request;
  env: E;
  params: Record<string, string | string[]>;
  data: unknown;
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  next?(input?: Request | string): Promise<Response>;
}

type PagesFunction<E = unknown> = (context: PagesContext<E>) => Response | Promise<Response>;

interface Env {
  GEMINI_API_KEY: string;
  GEMINI_API_BASE?: string;
  GEMINI_MODEL_DEFAULT?: string;
}

const UPSTREAM_BASE_DEFAULT = "https://generativelanguage.googleapis.com";

export const ACTION_POINT_COSTS: Record<string, number> = {
  curriculum: 20,
  module: 5,
  quiz: 10,
  exam: 15,
  flashcard: 5,
  tutor: 2,
  default: 5,
};

import { getSession, deductUserPoints, refundUserPoints, type Env as AuthEnv } from "../auth/_shared";

// Strip the /api/gemini prefix that triggered this Function.
// `params.path` is the array of path segments AFTER the [[path]] wildcard.
function buildUpstreamUrl(request: Request, params: PagesContext["params"]): string {
  const base = UPSTREAM_BASE_DEFAULT.replace(/\/+$/, "");
  const path = Array.isArray(params.path) ? params.path.join("/") : params.path ?? "";
  const search = new URL(request.url).search;
  return `${base}/${path}${search}`;
}

function buildUpstreamHeaders(request: Request, apiKey: string): Headers {
  const headers = new Headers(request.headers);
  // Replace any key the SDK might have set with the real one from the secret.
  headers.set("x-goog-api-key", apiKey);
  // `host` would be wrong upstream; let fetch set it.
  headers.delete("host");
  return headers;
}

async function proxyRequest(request: Request, env: Env, params: PagesContext["params"]): Promise<Response> {
  if (!env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured on this Pages project." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // Determine point cost from x-adaptiva-action header
  const action = request.headers.get("x-adaptiva-action") || "default";
  const cost = ACTION_POINT_COSTS[action] ?? 5;

  const pointResult = await deductUserPoints(request, env as unknown as AuthEnv, cost);
  if (!pointResult.success) {
    if (!pointResult.session) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Sign in with Google required to use AI features." }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        error: "insufficient_points",
        message: `Poin Anda tidak cukup (${pointResult.remainingPoints} Poin). Membutuhkan ${cost} Poin.`,
        remainingPoints: pointResult.remainingPoints,
        requiredPoints: cost,
      }),
      { status: 429, headers: { "content-type": "application/json" } }
    );
  }

  const url = buildUpstreamUrl(request, params);
  const headers = buildUpstreamHeaders(request, env.GEMINI_API_KEY);

  // We must clone the body before any attempt because a ReadableStream can only
  // be consumed once. We buffer it as ArrayBuffer so we can re-use it across retries.
  let bodyBuffer: ArrayBuffer | null = null;
  if (request.body) {
    try {
      bodyBuffer = await request.clone().arrayBuffer();
    } catch {
      bodyBuffer = null;
    }
  }

  // Transient HTTP status codes that are safe to retry (Gemini 503 overload, 502 Bad Gateway, 529 quota)
  // 429 (rate limit) is intentionally excluded: rapid retries worsen rate-limiting.
  const RETRYABLE_STATUSES = new Set([500, 502, 503, 529]);
  const MAX_UPSTREAM_RETRIES = 3;
  const UPSTREAM_RETRY_DELAY_MS = 1000;

  let upstream: Response | null = null;
  let lastNetworkError: unknown = null;

  for (let attempt = 1; attempt <= MAX_UPSTREAM_RETRIES; attempt++) {
    const init: RequestInit = {
      method: request.method,
      headers,
      body: bodyBuffer ?? undefined,
      redirect: "manual",
    };

    try {
      const res = await fetch(url, init);

      // If the response is retryable and we have more attempts left, retry after backoff.
      if (!res.ok && RETRYABLE_STATUSES.has(res.status) && attempt < MAX_UPSTREAM_RETRIES) {
        // Drain the body so the connection can be reused.
        await res.body?.cancel();
        const waitMs = UPSTREAM_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      upstream = res;
      lastNetworkError = null;
      break;
    } catch (err) {
      lastNetworkError = err;
      if (attempt < MAX_UPSTREAM_RETRIES) {
        const waitMs = UPSTREAM_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }

  // All attempts failed due to network error — refund and return.
  if (!upstream) {
    const refund = await refundUserPoints(request, env as unknown as AuthEnv, cost);
    const updatedPoints = refund.success ? refund.remainingPoints : pointResult.remainingPoints + cost;
    return new Response(
      JSON.stringify({
        error: "ai_upstream_network_error",
        message: "Gagal terhubung ke layanan AI. Poin Anda telah dikembalikan.",
        detail: String(lastNetworkError),
      }),
      // Use HTTP 400 so client-side callWithRetries does NOT misidentify this as 429/insufficient_points.
      { status: 400, headers: { "content-type": "application/json", "x-adaptiva-points": String(updatedPoints) } }
    );
  }

  // If Gemini API returned an HTTP error after all retries, refund points.
  if (!upstream.ok) {
    const refund = await refundUserPoints(request, env as unknown as AuthEnv, cost);
    const updatedPoints = refund.success ? refund.remainingPoints : pointResult.remainingPoints + cost;
    const resHeaders = new Headers(upstream.headers);
    resHeaders.set("x-adaptiva-points", String(updatedPoints));

    let errorDetail = "";
    try {
      const errJson = (await upstream.clone().json()) as { error?: { message?: string } } | null;
      if (typeof errJson?.error?.message === "string") {
        errorDetail = errJson.error.message;
      }
    } catch {
      // Ignore JSON parse errors on non-200 responses
    }

    return new Response(
      JSON.stringify({
        error: "ai_generation_failed",
        message: errorDetail || `Layanan AI mengalami kendala (${upstream.status}). Poin Anda telah dikembalikan.`,
        remainingPoints: updatedPoints,
      }),
      // Always use HTTP 400 so client-side callWithRetries never mistakes a Gemini rate-limit (429)
      // for an insufficient_points error (which is our own 429).
      { status: 400, headers: resHeaders }
    );
  }


  // Read body to inspect if candidates were blocked by safety or empty
  let responseText = "";
  try {
    responseText = await upstream.text();
  } catch {
    responseText = "";
  }

  let isBlocked = false;
  let blockedReason = "";
  try {
    if (responseText) {
      const jsonRes = JSON.parse(responseText);
      if (jsonRes.error) {
        isBlocked = true;
        blockedReason = jsonRes.error.message || "Gagal membuat konten dengan AI.";
      } else if (Array.isArray(jsonRes.candidates) && jsonRes.candidates.length > 0) {
        const firstCandidate = jsonRes.candidates[0];
        if (
          firstCandidate.finishReason &&
          firstCandidate.finishReason !== "STOP" &&
          firstCandidate.finishReason !== "MAX_TOKENS"
        ) {
          isBlocked = true;
          blockedReason = `AI terhenti dengan alasan: ${firstCandidate.finishReason}. Poin Anda telah dikembalikan.`;
        }
      }
    }
  } catch {
    // If text parsing fails, pass-through response as is
  }

  if (isBlocked) {
    const refund = await refundUserPoints(request, env as unknown as AuthEnv, cost);
    const updatedPoints = refund.success ? refund.remainingPoints : pointResult.remainingPoints + cost;
    const resHeaders = new Headers(upstream.headers);
    resHeaders.set("content-type", "application/json");
    resHeaders.set("x-adaptiva-points", String(updatedPoints));

    return new Response(
      JSON.stringify({
        error: "ai_generation_blocked",
        message: blockedReason || "Konten AI tidak dapat dibuat. Poin Anda telah dikembalikan.",
        remainingPoints: updatedPoints,
      }),
      { status: 400, headers: resHeaders }
    );
  }

  const resHeaders = new Headers(upstream.headers);
  resHeaders.set("x-adaptiva-points", String(pointResult.remainingPoints));

  return new Response(responseText, {
    status: upstream.status,
    headers: resHeaders,
  });
}

function corsHeaders(request: Request, extra: Record<string, string> = {}): Headers {
  const headers = new Headers(extra);
  const origin = request.headers.get("origin") || "*";
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-adaptiva-action, x-goog-api-key");
  headers.set("Access-Control-Expose-Headers", "x-adaptiva-points");
  return headers;
}

// Handle every method on the wildcard path: GET, POST, OPTIONS, etc.
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(context.request),
    });
  }

  try {
    const res = await proxyRequest(context.request, context.env, context.params);
    const headers = corsHeaders(context.request, Object.fromEntries(res.headers.entries()));
    return new Response(res.body, {
      status: res.status,
      headers,
    });
  } catch (err) {
    const action = context.request.headers.get("x-adaptiva-action") || "default";
    const cost = ACTION_POINT_COSTS[action] ?? 5;
    const refund = await refundUserPoints(context.request, context.env as unknown as AuthEnv, cost);
    const message = err instanceof Error ? err.message : String(err);
    const headers = corsHeaders(context.request, {
      "content-type": "application/json",
      "x-adaptiva-points": String(refund.remainingPoints),
    });
    return new Response(
      JSON.stringify({ error: "Proxy error", message: "Gagal memproses permintaan AI. Poin Anda telah dikembalikan.", detail: message }),
      { status: 502, headers }
    );
  }
};

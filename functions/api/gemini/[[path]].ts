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
// (e.g. /v1beta/models/gemini-2.5-flash:generateContent). Only the paths in
// ALLOWED_UPSTREAM_PATH are forwarded, so a new model on the frontend must be
// added there too.

// Self-contained context type so this file has no runtime dependencies on
// @cloudflare/workers-types. Mirrors the PagesFunction context shape.
import { getAllowedOrigin } from "../auth/_shared";

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

import {
  getSession,
  deductUserPoints,
  refundUserPoints,
  type Env as AuthEnv,
} from "../auth/_shared";

export const MAX_BODY_BYTES = 1048576;

const ALLOWED_UPSTREAM_PATH =
  /^v1beta\/models\/gemini-2\.5-flash:(generateContent|streamGenerateContent)$/;

// Own-property lookup: a plain object lookup would resolve names such as
// "constructor" to Object.prototype members, and a NaN cost passes every
// balance comparison.
export function resolveCost(action: string): number | null {
  return Object.hasOwn(ACTION_POINT_COSTS, action)
    ? ACTION_POINT_COSTS[action]
    : null;
}

type GuardResult =
  | { ok: true }
  | { ok: false; status: 400 | 405 | 413; error: string };

export function checkUpstreamRequest(
  request: Request,
  params: PagesContext["params"],
): GuardResult {
  if (request.method !== "POST") {
    return { ok: false, status: 405, error: "method_not_allowed" };
  }
  const path = Array.isArray(params.path)
    ? params.path.join("/")
    : (params.path ?? "");
  if (!ALLOWED_UPSTREAM_PATH.test(path)) {
    return { ok: false, status: 400, error: "unsupported_request" };
  }
  const query = new URL(request.url).search.replace(/^\?/, "");
  if (query !== "" && query !== "alt=sse") {
    return { ok: false, status: 400, error: "unsupported_request" };
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }
  return { ok: true };
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Strip the /api/gemini prefix that triggered this Function.
// `params.path` is the array of path segments AFTER the [[path]] wildcard.
function buildUpstreamUrl(
  request: Request,
  params: PagesContext["params"],
): string {
  const base = UPSTREAM_BASE_DEFAULT.replace(/\/+$/, "");
  const path = Array.isArray(params.path)
    ? params.path.join("/")
    : (params.path ?? "");
  const search = new URL(request.url).search;
  return `${base}/${path}${search}`;
}

// Allowlist rather than copy: the browser request carries the session cookie,
// which must never reach Google.
function buildUpstreamHeaders(request: Request, apiKey: string): Headers {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const apiClient = request.headers.get("x-goog-api-client");
  if (apiClient) headers.set("x-goog-api-client", apiClient);
  headers.set("x-goog-api-key", apiKey);
  return headers;
}

async function processPointDeduction(request: Request, env: Env, cost: number) {
  const pointResult = await deductUserPoints(
    request,
    env as unknown as AuthEnv,
    cost,
  );
  if (!pointResult.success) {
    if (!pointResult.session) {
      return {
        response: new Response(
          JSON.stringify({
            error: "unauthorized",
            message: "Sign in with Google required to use AI features.",
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
      };
    }
    return {
      response: new Response(
        JSON.stringify({
          error: "insufficient_points",
          message: `Poin Anda tidak cukup (${pointResult.remainingPoints} Poin). Membutuhkan ${cost} Poin.`,
          remainingPoints: pointResult.remainingPoints,
          requiredPoints: cost,
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    };
  }
  return { pointResult };
}

async function extractBodyBuffer(
  request: Request,
): Promise<ArrayBuffer | null> {
  let bodyBuffer: ArrayBuffer | null = null;
  if (request.body) {
    try {
      bodyBuffer = await request.clone().arrayBuffer();
    } catch {
      bodyBuffer = null;
    }
  }
  return bodyBuffer;
}

async function executeWithRetries(
  url: string,
  method: string,
  headers: Headers,
  bodyBuffer: ArrayBuffer | null,
) {
  const RETRYABLE_STATUSES = new Set([500, 502, 503, 529]);
  const MAX_UPSTREAM_RETRIES = 3;
  const UPSTREAM_RETRY_DELAY_MS = 1000;

  let upstream: Response | null = null;
  let lastNetworkError: unknown = null;

  for (let attempt = 1; attempt <= MAX_UPSTREAM_RETRIES; attempt++) {
    const init: RequestInit = {
      method,
      headers,
      body: bodyBuffer ?? undefined,
      redirect: "manual",
    };

    try {
      const res = await fetch(url, init);

      // If the response is retryable and we have more attempts left, retry after backoff.
      if (
        !res.ok &&
        RETRYABLE_STATUSES.has(res.status) &&
        attempt < MAX_UPSTREAM_RETRIES
      ) {
        // Drain the body so the connection can be reused.
        await res.body?.cancel();
        const waitMs = UPSTREAM_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      upstream = res;
      lastNetworkError = null;
      break;
    } catch (err) {
      lastNetworkError = err;
      if (attempt < MAX_UPSTREAM_RETRIES) {
        const waitMs = UPSTREAM_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  return { upstream, lastNetworkError };
}

async function handleNetworkErrorAndRefund(
  request: Request,
  env: Env,
  cost: number,
  currentRemainingPoints: number,
  lastNetworkError: unknown,
): Promise<Response> {
  const refund = await refundUserPoints(
    request,
    env as unknown as AuthEnv,
    cost,
  );
  const updatedPoints = refund.success
    ? refund.remainingPoints
    : currentRemainingPoints + cost;
  return new Response(
    JSON.stringify({
      error: "ai_upstream_network_error",
      message: "Gagal terhubung ke layanan AI. Poin Anda telah dikembalikan.",
      detail: String(lastNetworkError),
    }),
    {
      status: 400,
      headers: {
        "content-type": "application/json",
        "x-adaptiva-points": String(updatedPoints),
      },
    },
  );
}

async function handleUpstreamErrorAndRefund(
  request: Request,
  env: Env,
  upstream: Response,
  cost: number,
  currentRemainingPoints: number,
): Promise<Response> {
  const refund = await refundUserPoints(
    request,
    env as unknown as AuthEnv,
    cost,
  );
  const updatedPoints = refund.success
    ? refund.remainingPoints
    : currentRemainingPoints + cost;
  const resHeaders = new Headers(upstream.headers);
  resHeaders.set("x-adaptiva-points", String(updatedPoints));

  let errorDetail = "";
  let errorStatus = "";
  try {
    const errJson = (await upstream.clone().json()) as {
      error?: { message?: string; status?: string };
    } | null;
    if (typeof errJson?.error?.message === "string") {
      errorDetail = errJson.error.message;
    }
    if (typeof errJson?.error?.status === "string") {
      errorStatus = errJson.error.status;
    }
  } catch {
    // Ignore JSON parse errors on non-200 responses
  }

  // Surface upstream failure reason to server logs so 400s are diagnosable
  // from `wrangler pages deployment tail`. Client response stays unchanged.
  console.error("Gemini upstream error", {
    action: request.headers.get("x-adaptiva-action") || "default",
    upstreamStatus: upstream.status,
    upstreamErrorStatus: errorStatus || undefined,
    upstreamErrorMessage: errorDetail || undefined,
  });

  return new Response(
    JSON.stringify({
      error: "ai_generation_failed",
      message:
        errorDetail ||
        `Layanan AI mengalami kendala (${upstream.status}). Poin Anda telah dikembalikan.`,
      remainingPoints: updatedPoints,
    }),
    { status: 400, headers: resHeaders },
  );
}

async function validateSafetyAndRefund(
  request: Request,
  env: Env,
  upstream: Response,
  cost: number,
  currentRemainingPoints: number,
): Promise<{ response?: Response; responseText: string }> {
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
        blockedReason =
          jsonRes.error.message || "Gagal membuat konten dengan AI.";
      } else if (
        Array.isArray(jsonRes.candidates) &&
        jsonRes.candidates.length > 0
      ) {
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
    const refund = await refundUserPoints(
      request,
      env as unknown as AuthEnv,
      cost,
    );
    const updatedPoints = refund.success
      ? refund.remainingPoints
      : currentRemainingPoints + cost;
    const resHeaders = new Headers(upstream.headers);
    resHeaders.set("content-type", "application/json");
    resHeaders.set("x-adaptiva-points", String(updatedPoints));

    return {
      response: new Response(
        JSON.stringify({
          error: "ai_generation_blocked",
          message:
            blockedReason ||
            "Konten AI tidak dapat dibuat. Poin Anda telah dikembalikan.",
          remainingPoints: updatedPoints,
        }),
        { status: 400, headers: resHeaders },
      ),
      responseText,
    };
  }

  return { responseText };
}

// Points actually taken for this request, so an unexpected throw refunds only
// what was charged and never mints points when the deduction itself failed.
type Charge = { points: number };

async function proxyRequest(
  request: Request,
  env: Env,
  params: PagesContext["params"],
  charge: Charge,
): Promise<Response> {
  if (!env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "GEMINI_API_KEY is not configured on this Pages project.",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const guard = checkUpstreamRequest(request, params);
  if (!guard.ok) {
    return jsonError(guard.status, guard.error);
  }

  const action = request.headers.get("x-adaptiva-action") || "default";
  const cost = resolveCost(action);
  if (cost === null) {
    return jsonError(400, "unknown_action");
  }

  // The declared content-length can be absent or wrong, so the buffered size
  // is checked too, still before any points are taken.
  const bodyBuffer = await extractBodyBuffer(request);
  if (bodyBuffer && bodyBuffer.byteLength > MAX_BODY_BYTES) {
    return jsonError(413, "payload_too_large");
  }

  const deduction = await processPointDeduction(request, env, cost);
  if (deduction.response) {
    return deduction.response;
  }
  const pointResult = deduction.pointResult!;
  charge.points = cost;

  const url = buildUpstreamUrl(request, params);
  const headers = buildUpstreamHeaders(request, env.GEMINI_API_KEY);

  const { upstream, lastNetworkError } = await executeWithRetries(
    url,
    request.method,
    headers,
    bodyBuffer,
  );

  if (!upstream) {
    return handleNetworkErrorAndRefund(
      request,
      env,
      cost,
      pointResult.remainingPoints,
      lastNetworkError,
    );
  }

  if (!upstream.ok) {
    return handleUpstreamErrorAndRefund(
      request,
      env,
      upstream,
      cost,
      pointResult.remainingPoints,
    );
  }

  const safetyValidation = await validateSafetyAndRefund(
    request,
    env,
    upstream,
    cost,
    pointResult.remainingPoints,
  );
  if (safetyValidation.response) {
    return safetyValidation.response;
  }

  const resHeaders = new Headers(upstream.headers);
  resHeaders.set("x-adaptiva-points", String(pointResult.remainingPoints));

  return new Response(safetyValidation.responseText, {
    status: upstream.status,
    headers: resHeaders,
  });
}

function corsHeaders(
  request: Request,
  env?: Env,
  extra: Record<string, string> = {},
): Headers {
  const headers = new Headers(extra);
  const origin = getAllowedOrigin(request, env as any);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-adaptiva-action, x-goog-api-key",
  );
  headers.set("Access-Control-Expose-Headers", "x-adaptiva-points");
  return headers;
}

// OPTIONS answers the preflight; every other method goes through the guard.
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(context.request, context.env),
    });
  }

  const charge: Charge = { points: 0 };
  try {
    const res = await proxyRequest(
      context.request,
      context.env,
      context.params,
      charge,
    );
    const headers = corsHeaders(
      context.request,
      context.env,
      Object.fromEntries(res.headers.entries()),
    );
    return new Response(res.body, {
      status: res.status,
      headers,
    });
  } catch (err) {
    const extra: Record<string, string> = {
      "content-type": "application/json",
    };
    if (charge.points > 0) {
      const refund = await refundUserPoints(
        context.request,
        context.env as unknown as AuthEnv,
        charge.points,
      );
      extra["x-adaptiva-points"] = String(refund.remainingPoints);
    }
    const message = err instanceof Error ? err.message : String(err);
    const headers = corsHeaders(context.request, context.env, extra);
    return new Response(
      JSON.stringify({
        error: "Proxy error",
        message: "Gagal memproses permintaan AI. Poin Anda telah dikembalikan.",
        detail: message,
      }),
      { status: 502, headers },
    );
  }
};

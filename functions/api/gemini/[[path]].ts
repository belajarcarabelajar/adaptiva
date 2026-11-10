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

// Upper bound on generationConfig.maxOutputTokens per action, forced by the
// proxy so a request paying a cheap action price cannot buy a long generation
// (gemini-2.5-flash otherwise allows 65536). On 2.5 models thinking tokens
// count against this limit too, so each cap leaves room for dynamic thinking
// on top of what the web app asks for (apps/web/src/services/gemini/*.ts, none
// of which sets maxOutputTokens itself):
//   curriculum  module titles and a 7-day plan as short JSON      -> 16384
//   module      one full textbook chapter as Markdown in JSON     -> 32768
//   quiz        10 multiple-choice questions with explanations    -> 16384
//   exam        user-chosen question count, no UI maximum         -> 32768
//   flashcard   about 25 term and definition pairs                -> 16384
//   tutor       one concise chat reply                            -> 8192
//   default     resource list (books, articles, videos) Markdown  -> 16384
// Every key of ACTION_POINT_COSTS must have a cap here.
export const ACTION_OUTPUT_TOKEN_CAPS: Record<string, number> = {
  curriculum: 16384,
  module: 32768,
  quiz: 16384,
  exam: 32768,
  flashcard: 16384,
  tutor: 8192,
  default: 16384,
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

export function resolveOutputCap(action: string): number | null {
  return Object.hasOwn(ACTION_OUTPUT_TOKEN_CAPS, action)
    ? ACTION_OUTPUT_TOKEN_CAPS[action]
    : null;
}

/**
 * Body with generationConfig.maxOutputTokens at most `cap`: a valid smaller
 * client value is kept, anything else becomes `cap`. Null when the body is not
 * a JSON object, since the cap could not be enforced on it.
 */
export function capOutputTokens(
  bodyBuffer: ArrayBuffer | null,
  cap: number,
): ArrayBuffer | null {
  if (!bodyBuffer) return null;
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bodyBuffer));
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const request = body as Record<string, unknown>;
  const config = request.generationConfig ?? {};
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return null;
  }
  const generationConfig = config as Record<string, unknown>;
  const requested = generationConfig.maxOutputTokens;
  const keep =
    typeof requested === "number" &&
    Number.isInteger(requested) &&
    requested > 0 &&
    requested <= cap;
  request.generationConfig = {
    ...generationConfig,
    maxOutputTokens: keep ? requested : cap,
  };
  return new TextEncoder().encode(JSON.stringify(request)).buffer as ArrayBuffer;
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

// Points actually taken for this request, so an unexpected throw refunds only
// what was charged and never mints points when the deduction itself failed.
type Charge = { points: number };

type RefundOutcome = { refunded: boolean; remainingPoints?: number };

/**
 * Gives back the charge at most once and never reports a refund that did not
 * land: a failed or throwing refund is logged and the caller shows the
 * balance as it stands after the deduction.
 */
async function refundCharge(
  request: Request,
  env: Env,
  charge: Charge,
  balanceAfterCharge?: number,
): Promise<RefundOutcome> {
  const points = charge.points;
  charge.points = 0;
  if (points <= 0) return { refunded: false, remainingPoints: balanceAfterCharge };
  let error: string | undefined;
  try {
    const refund = await refundUserPoints(
      request,
      env as unknown as AuthEnv,
      points,
    );
    if (refund.success) {
      return { refunded: true, remainingPoints: refund.remainingPoints };
    }
  } catch (err) {
    error = String(err);
  }
  console.error("Points refund failed", {
    action: request.headers.get("x-adaptiva-action") || "default",
    points,
    error,
  });
  return { refunded: false, remainingPoints: balanceAfterCharge };
}

function refundNote(outcome: RefundOutcome): string {
  return outcome.refunded
    ? "Poin Anda telah dikembalikan."
    : "Poin Anda gagal dikembalikan, silakan hubungi admin.";
}

async function handleNetworkErrorAndRefund(
  request: Request,
  env: Env,
  charge: Charge,
  currentRemainingPoints: number,
  lastNetworkError: unknown,
): Promise<Response> {
  const outcome = await refundCharge(request, env, charge, currentRemainingPoints);
  return new Response(
    JSON.stringify({
      error: "ai_upstream_network_error",
      message: `Gagal terhubung ke layanan AI. ${refundNote(outcome)}`,
      detail: String(lastNetworkError),
      refunded: outcome.refunded,
      remainingPoints: outcome.remainingPoints,
    }),
    {
      status: 400,
      headers: {
        "content-type": "application/json",
        "x-adaptiva-points": String(outcome.remainingPoints),
      },
    },
  );
}

async function handleUpstreamErrorAndRefund(
  request: Request,
  env: Env,
  upstream: Response,
  charge: Charge,
  currentRemainingPoints: number,
): Promise<Response> {
  const outcome = await refundCharge(request, env, charge, currentRemainingPoints);
  const updatedPoints = outcome.remainingPoints;
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
        `Layanan AI mengalami kendala (${upstream.status}). ${refundNote(outcome)}`,
      refunded: outcome.refunded,
      remainingPoints: updatedPoints,
    }),
    { status: 400, headers: resHeaders },
  );
}

type UnusableResponse = { billed: boolean; reason: string };

/**
 * Refund rule: Google does not bill a request that fails (network error,
 * non-2xx, or a 2xx body holding an error object), so those are refunded.
 * Every other 2xx is billed, including a blocked prompt (promptFeedback
 * carries usageMetadata.promptTokenCount) and a candidate stopped by SAFETY,
 * RECITATION or another filter after tokens were generated, so the charge
 * stays. MAX_TOKENS passes through as output the client can still use.
 */
function classifyUnusable(responseText: string): UnusableResponse | null {
  let jsonRes: any;
  try {
    jsonRes = JSON.parse(responseText);
  } catch {
    // Streaming (SSE) and other non-JSON bodies pass through as is.
    return null;
  }
  if (typeof jsonRes !== "object" || jsonRes === null) return null;
  if (jsonRes.error) {
    return {
      billed: false,
      reason: jsonRes.error.message || "Gagal membuat konten dengan AI.",
    };
  }
  const blockReason = jsonRes.promptFeedback?.blockReason;
  if (blockReason) return { billed: true, reason: String(blockReason) };
  if (!Array.isArray(jsonRes.candidates) || jsonRes.candidates.length === 0) {
    return { billed: true, reason: "NO_CANDIDATES" };
  }
  const finishReason = jsonRes.candidates[0]?.finishReason;
  if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
    return { billed: true, reason: String(finishReason) };
  }
  return null;
}

async function validateSafetyAndRefund(
  request: Request,
  env: Env,
  upstream: Response,
  charge: Charge,
  currentRemainingPoints: number,
): Promise<{ response?: Response; responseText: string }> {
  let responseText = "";
  try {
    responseText = await upstream.text();
  } catch {
    responseText = "";
  }

  const unusable = responseText ? classifyUnusable(responseText) : null;
  if (!unusable) return { responseText };

  let refunded = false;
  let updatedPoints: number | undefined = currentRemainingPoints;
  let message: string;
  if (unusable.billed) {
    message = `AI terhenti dengan alasan: ${unusable.reason}. Poin tidak dikembalikan karena layanan AI tetap menagih permintaan ini.`;
  } else {
    const outcome = await refundCharge(request, env, charge, currentRemainingPoints);
    refunded = outcome.refunded;
    updatedPoints = outcome.remainingPoints;
    message = `${unusable.reason} ${refundNote(outcome)}`;
  }

  const resHeaders = new Headers(upstream.headers);
  resHeaders.set("content-type", "application/json");
  resHeaders.set("x-adaptiva-points", String(updatedPoints));
  return {
    response: new Response(
      JSON.stringify({
        error: "ai_generation_blocked",
        message,
        refunded,
        remainingPoints: updatedPoints,
      }),
      { status: 400, headers: resHeaders },
    ),
    responseText,
  };
}

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

  const outputCap = resolveOutputCap(action);
  if (outputCap === null) {
    return jsonError(400, "unknown_action");
  }
  const cappedBody = capOutputTokens(bodyBuffer, outputCap);
  if (!cappedBody) {
    return jsonError(400, "unsupported_request");
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
    cappedBody,
  );

  if (!upstream) {
    return handleNetworkErrorAndRefund(
      request,
      env,
      charge,
      pointResult.remainingPoints,
      lastNetworkError,
    );
  }

  if (!upstream.ok) {
    return handleUpstreamErrorAndRefund(
      request,
      env,
      upstream,
      charge,
      pointResult.remainingPoints,
    );
  }

  const safetyValidation = await validateSafetyAndRefund(
    request,
    env,
    upstream,
    charge,
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
    const charged = charge.points > 0;
    const outcome = await refundCharge(context.request, context.env, charge);
    if (outcome.remainingPoints !== undefined) {
      extra["x-adaptiva-points"] = String(outcome.remainingPoints);
    }
    const message = err instanceof Error ? err.message : String(err);
    const headers = corsHeaders(context.request, context.env, extra);
    return new Response(
      JSON.stringify({
        error: "Proxy error",
        message: charged
          ? `Gagal memproses permintaan AI. ${refundNote(outcome)}`
          : "Gagal memproses permintaan AI.",
        detail: message,
        refunded: outcome.refunded,
      }),
      { status: 502, headers },
    );
  }
};

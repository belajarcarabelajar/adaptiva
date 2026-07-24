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
// (e.g. /v1beta/models/gemini-3.5-flash:generateContent). We forward whatever
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

  const url = buildUpstreamUrl(request, params);
  const headers = buildUpstreamHeaders(request, env.GEMINI_API_KEY);

  const init: RequestInit = {
    method: request.method,
    headers,
    // request.body is a ReadableStream; safe to forward for POST/PUT/PATCH.
    body: request.body,
    // Don't auto-decompress: the SDK expects the raw payload.
    redirect: "manual",
  };

  const upstream = await fetch(url, init);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

// Handle every method on the wildcard path: GET, POST, OPTIONS, etc.
export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    return await proxyRequest(context.request, context.env, context.params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Proxy error", detail: message }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
};

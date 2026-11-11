// Request handling for /api/ai: validation, points, the Claude call, and the
// error contract of the former Gemini proxy.
// Shared by the Pages Function and the dev server, which passes no-op points.
import {
  classifyGatewayError,
  type ClaudeGateway,
  type ClaudeUsage,
} from "./_claude";
import { runResourceSearch } from "./_search";
import { ACTION_POINT_COSTS, resolveTask, type TaskSpec } from "./_tasks";
import {
  createTutorSseResponse,
  streamTutorText,
  validateTutorBody,
  type TutorBody,
} from "./_tutor";

export const MAX_BODY_BYTES = 1048576;

const BILLED_REFUSAL_CATEGORIES = new Set([
  "bio",
  "frontier_llm",
  "reasoning_extraction",
]);

export interface AiEnv {
  ANTHROPIC_API_KEY?: string;
}

export interface AiDeps<E = AiEnv> {
  gateway: ClaudeGateway;
  deduct(
    request: Request,
    env: E,
    cost: number,
  ): Promise<{ success: boolean; remainingPoints: number; session: unknown }>;
  refund(
    request: Request,
    env: E,
    amount: number,
  ): Promise<{ success: boolean; remainingPoints: number }>;
  // Optional so index.ts and the dev server use the real Claude calls; tests inject fakes.
  tutor?: { stream: typeof streamTutorText };
  search?: { run: typeof runResourceSearch };
}

// Points actually taken for this request, so an unexpected throw refunds only
// what was charged and never mints points when the deduction itself failed.
type Charge = { points: number; action: string; balanceAfterCharge?: number };

type RefundOutcome = { refunded: boolean; remainingPoints?: number };

function json(
  status: number,
  body: unknown,
  remainingPoints?: number,
): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (remainingPoints !== undefined) {
    headers.set("x-adaptiva-points", String(remainingPoints));
  }
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Gives back the charge at most once and never reports a refund that did not
 * land: a failed or throwing refund is logged and the caller shows the
 * balance as it stands after the deduction.
 */
async function refundCharge<E>(
  request: Request,
  env: E,
  deps: AiDeps<E>,
  charge: Charge,
): Promise<RefundOutcome> {
  const points = charge.points;
  charge.points = 0;
  if (points <= 0) {
    return { refunded: false, remainingPoints: charge.balanceAfterCharge };
  }
  let error: string | undefined;
  try {
    const refund = await deps.refund(request, env, points);
    if (refund.success) {
      return { refunded: true, remainingPoints: refund.remainingPoints };
    }
  } catch (err) {
    error = String(err);
  }
  console.error("Points refund failed", { action: charge.action, points, error });
  return { refunded: false, remainingPoints: charge.balanceAfterCharge };
}

function refundNote(outcome: RefundOutcome): string {
  return outcome.refunded
    ? "Poin Anda telah dikembalikan."
    : "Poin Anda gagal dikembalikan, silakan hubungi admin.";
}

function isUsableJson(result: { text: string; stopReason: string | null }): boolean {
  if (result.stopReason === "max_tokens") return false;
  try {
    JSON.parse(result.text);
    return true;
  } catch {
    return false;
  }
}

type Parsed =
  | { ok: true; spec: TaskSpec; prompt: string; system?: string; tutor?: undefined }
  | { ok: true; spec: TaskSpec; tutor: TutorBody }
  | { ok: false; response: Response };

async function parseRequest(request: Request): Promise<Parsed> {
  const fail = (status: number, error: string): Parsed => ({
    ok: false,
    response: json(status, { error }),
  });

  if (request.method !== "POST") return fail(405, "method_not_allowed");
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return fail(413, "payload_too_large");

  // The declared content-length can be absent or wrong, so the buffered size
  // is checked too, still before any points are taken.
  let buffer: ArrayBuffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return fail(400, "unsupported_request");
  }
  if (buffer.byteLength > MAX_BODY_BYTES) return fail(413, "payload_too_large");

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    return fail(400, "unsupported_request");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail(400, "unsupported_request");
  }
  const fields = body as Record<string, unknown>;

  const spec = typeof fields.task === "string" ? resolveTask(fields.task) : null;
  if (!spec) return fail(400, "unknown_task");

  if (spec.kind === "stream") {
    const tutor = validateTutorBody(fields);
    if (!tutor) return fail(400, "unsupported_request");
    return { ok: true, spec, tutor };
  }

  const { prompt, system } = fields;
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return fail(400, "unsupported_request");
  }
  if (system !== undefined && typeof system !== "string") {
    return fail(400, "unsupported_request");
  }
  return {
    ok: true,
    spec,
    prompt,
    ...(system !== undefined ? { system } : {}),
  };
}

export async function handleAiRequest<E extends AiEnv>(
  request: Request,
  env: E,
  deps: AiDeps<E>,
): Promise<Response> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, {
      error: "ANTHROPIC_API_KEY is not configured on this Pages project.",
    });
  }

  const parsed = await parseRequest(request);
  if (!parsed.ok) return parsed.response;
  const { spec } = parsed;
  const cost = ACTION_POINT_COSTS[spec.action];

  const charge: Charge = { points: 0, action: spec.action };
  try {
    const pointResult = await deps.deduct(request, env, cost);
    if (!pointResult.success) {
      if (!pointResult.session) {
        return json(401, {
          error: "unauthorized",
          message: "Sign in with Google required to use AI features.",
        });
      }
      return json(429, {
        error: "insufficient_points",
        message: `Poin Anda tidak cukup (${pointResult.remainingPoints} Poin). Membutuhkan ${cost} Poin.`,
        remainingPoints: pointResult.remainingPoints,
        requiredPoints: cost,
      });
    }
    charge.points = cost;
    charge.balanceAfterCharge = pointResult.remainingPoints;

    if (parsed.tutor) {
      const { system, messages } = parsed.tutor;
      const stream = deps.tutor?.stream ?? streamTutorText;
      return createTutorSseResponse(
        (onDelta) =>
          stream({
            apiKey,
            model: spec.model,
            effort: spec.effort,
            maxTokens: spec.maxTokens,
            system,
            messages,
            onDelta,
          }),
        {
          onErrorBeforeOutput: async (err) => {
            const info = classifyGatewayError(err);
            const outcome = await refundCharge(request, env, deps, charge);
            if (info.kind === "network") {
              return {
                error: "ai_upstream_network_error",
                message: `Gagal terhubung ke layanan AI. ${refundNote(outcome)}`,
              };
            }
            console.error("Claude tutor error", {
              task: spec.id,
              status: info.kind === "api" ? info.status : undefined,
              message: info.detail || undefined,
            });
            const status = info.kind === "api" ? ` (${info.status})` : "";
            return {
              error: "ai_generation_failed",
              message: `Layanan AI mengalami kendala${status}. ${refundNote(outcome)}`,
            };
          },
          onRefusalBeforeOutput: async (category) => {
            const reason = category || "refusal";
            if (BILLED_REFUSAL_CATEGORIES.has(category ?? "")) {
              return {
                error: "ai_generation_blocked",
                message: `AI terhenti dengan alasan: ${reason}. Poin tidak dikembalikan karena layanan AI tetap menagih permintaan ini.`,
              };
            }
            const outcome = await refundCharge(request, env, deps, charge);
            return {
              error: "ai_generation_blocked",
              message: `AI terhenti dengan alasan: ${reason}. ${refundNote(outcome)}`,
            };
          },
          headers: { "x-adaptiva-points": String(pointResult.remainingPoints) },
        },
      );
    }

    let result: {
      text: string;
      stopReason: string | null;
      refusalCategory?: string | null;
      sources?: { url: string; title: string }[];
      usage?: ClaudeUsage;
    };
    try {
      if (spec.kind === "search") {
        const run = deps.search?.run ?? runResourceSearch;
        result = await run({
          apiKey,
          model: spec.model,
          // The registry gives resources.search effort "medium", the only value the search call takes.
          effort: spec.effort as "medium",
          maxTokens: spec.maxTokens,
          prompt: parsed.prompt,
        });
      } else {
        result = await deps.gateway.complete(spec, {
          prompt: parsed.prompt,
          ...(parsed.system !== undefined ? { system: parsed.system } : {}),
        });
      }
    } catch (err) {
      const info = classifyGatewayError(err);
      if (info.kind === "unexpected") throw err;
      const outcome = await refundCharge(request, env, deps, charge);
      if (info.kind === "network") {
        return json(
          400,
          {
            error: "ai_upstream_network_error",
            message: `Gagal terhubung ke layanan AI. ${refundNote(outcome)}`,
            detail: String(err),
            refunded: outcome.refunded,
            remainingPoints: outcome.remainingPoints,
          },
          outcome.remainingPoints,
        );
      }
      // Logged so 400s are diagnosable from `wrangler pages deployment tail`.
      console.error("Claude API error", {
        action: spec.action,
        task: spec.id,
        status: info.status,
        message: info.detail || undefined,
      });
      return json(
        400,
        {
          error: "ai_generation_failed",
          message:
            info.detail ||
            `Layanan AI mengalami kendala (${info.status}). ${refundNote(outcome)}`,
          refunded: outcome.refunded,
          remainingPoints: outcome.remainingPoints,
        },
        outcome.remainingPoints,
      );
    }

    const empty = result.text.trim() === "";

    if (result.stopReason === "refusal") {
      const reason = result.refusalCategory || "refusal";
      // Claude bills a refusal before any output only for these categories,
      // and bills every refusal that came after partial output.
      const billed =
        !empty || BILLED_REFUSAL_CATEGORIES.has(result.refusalCategory ?? "");
      if (!billed) {
        const outcome = await refundCharge(request, env, deps, charge);
        return json(
          400,
          {
            error: "ai_generation_blocked",
            message: `AI terhenti dengan alasan: ${reason}. ${refundNote(outcome)}`,
            refunded: outcome.refunded,
            remainingPoints: outcome.remainingPoints,
          },
          outcome.remainingPoints,
        );
      }
      return json(
        400,
        {
          error: "ai_generation_blocked",
          message: `AI terhenti dengan alasan: ${reason}. Poin tidak dikembalikan karena layanan AI tetap menagih permintaan ini.`,
          refunded: false,
          remainingPoints: pointResult.remainingPoints,
        },
        pointResult.remainingPoints,
      );
    }

    if (empty) {
      const outcome = await refundCharge(request, env, deps, charge);
      return json(
        400,
        {
          error: "ai_generation_failed",
          message: `AI tidak menghasilkan jawaban. ${refundNote(outcome)}`,
          refunded: outcome.refunded,
          remainingPoints: outcome.remainingPoints,
        },
        outcome.remainingPoints,
      );
    }

    if (spec.kind === "json" && !isUsableJson(result)) {
      console.error("Claude JSON output unusable", {
        task: spec.id,
        stopReason: result.stopReason,
      });
      const outcome = await refundCharge(request, env, deps, charge);
      return json(
        400,
        {
          error: "ai_generation_failed",
          message: `Jawaban AI tidak lengkap. ${refundNote(outcome)}`,
          refunded: outcome.refunded,
          remainingPoints: outcome.remainingPoints,
        },
        outcome.remainingPoints,
      );
    }

    if (result.usage) {
      console.log("Claude usage", {
        task: spec.id,
        model: spec.model,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        web_search_requests: result.usage.server_tool_use?.web_search_requests,
      });
    }

    const body =
      spec.kind === "search"
        ? { text: result.text, sources: result.sources ?? [] }
        : { text: result.text };
    return json(200, body, pointResult.remainingPoints);
  } catch (err) {
    const charged = charge.points > 0;
    const outcome = await refundCharge(request, env, deps, charge);
    return json(
      502,
      {
        error: "Proxy error",
        message: charged
          ? `Gagal memproses permintaan AI. ${refundNote(outcome)}`
          : "Gagal memproses permintaan AI.",
        detail: err instanceof Error ? err.message : String(err),
        refunded: outcome.refunded,
      },
      outcome.remainingPoints,
    );
  }
}

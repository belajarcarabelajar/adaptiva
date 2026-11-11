// Request handling for /api/ai: validation, points, the Claude call, and the
// error contract of the old Gemini proxy (functions/api/gemini/[[path]].ts).
// Shared by the Pages Function and the dev server, which passes no-op points.
import { classifyGatewayError, type ClaudeGateway } from "./_claude";
import { ACTION_POINT_COSTS, resolveTask, type TaskSpec } from "./_tasks";

export const MAX_BODY_BYTES = 1048576;

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

type Parsed =
  | { ok: true; spec: TaskSpec; prompt: string; system?: string }
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
  // tutor.chat (T2) and resources.search (T3) are registered but not served yet.
  if (spec.kind !== "json") return fail(400, "unsupported_request");

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
  if (!env.ANTHROPIC_API_KEY) {
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

    let result;
    try {
      result = await deps.gateway.complete(spec, {
        prompt: parsed.prompt,
        ...(parsed.system !== undefined ? { system: parsed.system } : {}),
      });
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

    // Claude bills a refusal, so the charge stays, like the old blocked case.
    if (result.stopReason === "refusal") {
      const reason = result.refusalCategory || "refusal";
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

    return json(200, { text: result.text }, pointResult.remainingPoints);
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

// Pages Function for POST /api/ai: the web app sends {task, prompt, system?}
// and this Function calls Claude with the model, effort, cap and schema the
// server chooses (see _tasks.ts). ANTHROPIC_API_KEY is a Pages secret.
import {
  deductUserPoints,
  getAllowedOrigin,
  refundUserPoints,
  type Env as AuthEnv,
  type PagesFunction,
} from "../auth/_shared";
import { createClaudeGateway } from "./_claude";
import { handleAiRequest, type AiEnv } from "./_core";

type Env = AuthEnv & AiEnv;

function corsHeaders(
  request: Request,
  env?: Env,
  extra: Record<string, string> = {},
): Headers {
  const headers = new Headers(extra);
  headers.set("Access-Control-Allow-Origin", getAllowedOrigin(request, env));
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Expose-Headers", "x-adaptiva-points");
  return headers;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const res = await handleAiRequest<Env>(request, env, {
    gateway: createClaudeGateway(env.ANTHROPIC_API_KEY ?? ""),
    deduct: deductUserPoints,
    refund: refundUserPoints,
  });
  return new Response(res.body, {
    status: res.status,
    headers: corsHeaders(request, env, Object.fromEntries(res.headers.entries())),
  });
};

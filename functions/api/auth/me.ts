// Pages Function: return the current user (or 401).
// 200: { user: { id, email, name, picture, points } } (points from the account ledger)
// 401: { error: "not_authenticated" }
// Never returns tokens.

import {
  ADMIN_POINTS,
  getSession,
  isAdminEmail,
  jsonResponse,
  getAllowedOrigin,
  type Env,
  type PagesFunction,
} from "./_shared";
import { getBalance } from "./points";

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  const origin = getAllowedOrigin(context.request, context.env);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse(request, { error: "not_authenticated" }, 401, {}, env);
  }
  return jsonResponse(request, {
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      picture: session.picture,
      points: isAdminEmail(env, session.email)
        ? ADMIN_POINTS
        : await getBalance(env, session.userId),
    },
  }, 200, {}, env);
};

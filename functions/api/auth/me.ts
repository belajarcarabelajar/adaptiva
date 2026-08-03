// Pages Function: return the current user (or 401).
// 200: { user: { id, email, name, picture } }
// 401: { error: "not_authenticated" }
// Never returns tokens.

import {
  getSession,
  jsonResponse,
  getAllowedOrigin,
  type Env,
  type PagesFunction,
} from "./_shared";

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  const origin = getAllowedOrigin(context.request);
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
    return jsonResponse(request, { error: "not_authenticated" }, 401);
  }
  return jsonResponse(request, {
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      picture: session.picture,
      points: session.points ?? 100,
    },
  });
};

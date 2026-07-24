// Pages Function: return the current user (or 401).
// 200: { user: { id, email, name, picture } }
// 401: { error: "not_authenticated" }
// Never returns tokens.

import {
  getSession,
  jsonResponse,
  type Env,
  type PagesFunction,
} from "./_shared";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse({ error: "not_authenticated" }, 401);
  }
  return jsonResponse({
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      picture: session.picture,
    },
  });
};

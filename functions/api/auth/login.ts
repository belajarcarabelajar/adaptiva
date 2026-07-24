// Pages Function: initiate Google OAuth Authorization Code flow.
// - Generates a CSRF `state`, stores in KV (TTL 10 min).
// - 302 redirects the browser to Google's authorize endpoint.

import {
  buildAuthorizeUrl,
  createState,
  getOrigin,
  redirectResponse,
  type Env,
  type PagesFunction,
} from "./_shared";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSIONS) {
    return redirectResponse("/?auth_error=not_configured");
  }

  const state = await createState(env);
  const url = buildAuthorizeUrl(getOrigin(request, env), env.GOOGLE_CLIENT_ID, state);
  return redirectResponse(url);
};

// Pages Function: initiate Google OAuth Authorization Code flow.
// - Generates a CSRF `state` and binds it to this browser with a short-lived
//   HttpOnly cookie (TTL 10 min). Nothing is written to KV.
// - 302 redirects the browser to Google's authorize endpoint.

import {
  buildAuthorizeUrl,
  buildStateCookie,
  createState,
  getOrigin,
  isHttps,
  redirectResponse,
  type Env,
  type PagesFunction,
} from "./_shared";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSIONS) {
    return redirectResponse("/?auth_error=not_configured");
  }

  const state = createState();
  const url = buildAuthorizeUrl(getOrigin(request, env), env.GOOGLE_CLIENT_ID, state);
  return redirectResponse(url, 302, {
    "Set-Cookie": buildStateCookie(state, isHttps(request, env)),
  });
};

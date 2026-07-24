// Pages Function: clear the current session and redirect to /.
// Safe to call when not signed in (no-op for KV, clears cookie anyway).

import {
  buildClearCookie,
  deleteSession,
  isHttps,
  redirectResponse,
  type Env,
  type PagesFunction,
} from "./_shared";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  if (env.SESSIONS) {
    await deleteSession(request, env);
  }
  const cookie = buildClearCookie(isHttps(request, env));
  return redirectResponse("/", 302, { "Set-Cookie": cookie });
};

// Allow POST too so a <form method="post"> sign-out works without JS.
export const onRequestPost = onRequestGet;

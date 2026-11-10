const LOOPBACK_HOST = '127.0.0.1';

export function resolveListenHost(env) {
  const host = env.HOST?.trim();
  return host ? host : LOOPBACK_HOST;
}

const LOOPBACK_HOST = '127.0.0.1';

function isLoopback(host) {
  return host === 'localhost' || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host);
}

// The local /api/ai route spends the owner's key with no auth (CORS is browser-only),
// so binding beyond loopback must be a deliberate choice.
export function resolveListenHost(env) {
  const host = env.HOST?.trim();
  if (!host) return LOOPBACK_HOST;
  if (isLoopback(host) || env.ALLOW_PUBLIC_HOST === '1') return host;
  throw new Error(
    `Refusing to bind to non-loopback HOST=${host}: the local /api/ai route uses ANTHROPIC_API_KEY without authentication. ` +
      'Set ALLOW_PUBLIC_HOST=1 to bind anyway.'
  );
}

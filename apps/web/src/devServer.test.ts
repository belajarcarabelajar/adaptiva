import { describe, expect, it, vi } from 'vitest';

// Loading the real vite and plugin-react pulls in esbuild, which refuses to run
// under jsdom (cross-realm Uint8Array); setupTests.ts needs window, so the node
// environment is not an option. defineConfig is an identity function anyway.
vi.mock('vitest/config', () => ({ defineConfig: (config: unknown) => config }));
vi.mock('@vitejs/plugin-react', () => ({ default: () => ({ name: 'react-stub' }) }));

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];

describe('Vite dev server', () => {
  it('binds to loopback only', async () => {
    const { default: config } = await import('../vite.config');
    const host = config.server?.host;
    if (host !== undefined) {
      expect(LOOPBACK_HOSTS).toContain(host);
    }
  });

  // Otherwise Vite's SPA fallback answers /api/auth/* with index.html and 200.
  it('proxies every /api path to the local API server', async () => {
    const { default: config } = await import('../vite.config');
    const proxy = config.server?.proxy as Record<string, { target: string }>;
    expect(Object.keys(proxy)).toEqual(['/api']);
    expect(proxy['/api'].target).toBe('http://127.0.0.1:3001');
  });
});

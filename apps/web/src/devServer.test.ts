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
});

import { describe, expect, test } from 'bun:test';
import path from 'path';

const SERVER = path.join(import.meta.dir, 'server.js');

async function startServer(env) {
  const proc = Bun.spawn(['bun', SERVER], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PORT: '0', ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000));
  const exit = await Promise.race([proc.exited, timeout]);
  if (exit === 'timeout') proc.kill();
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exit, stdout, stderr };
}

describe('server.js startup', () => {
  test('exits 1 with a clear error when HOST is not loopback', async () => {
    const { exit, stderr } = await startServer({ HOST: '0.0.0.0', ANTHROPIC_API_KEY: 'k' });
    expect(exit).toBe(1);
    expect(stderr).toContain('ALLOW_PUBLIC_HOST');
  });

  test('exits 1 with a clear error when ANTHROPIC_API_KEY is missing', async () => {
    // An empty value counts as set, so dotenv will not fill it from a real .env.local.
    const { exit, stderr } = await startServer({ ANTHROPIC_API_KEY: '' });
    expect(exit).toBe(1);
    expect(stderr).toContain('ANTHROPIC_API_KEY is not set');
  });

  test('exits 1 with the bind error when the port is already in use', async () => {
    const blocker = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('') });
    try {
      // Express 5 hands listen errors to the callback instead of throwing them.
      const { exit, stdout, stderr } = await startServer({ ANTHROPIC_API_KEY: 'k', PORT: String(blocker.port) });
      expect(exit).toBe(1);
      expect(stdout).not.toContain('Server is running');
      expect(stderr).toContain('EADDRINUSE');
    } finally {
      blocker.stop(true);
    }
  });

  test('loading the env file prints no dotenv banner', async () => {
    // dotenv 17+ logs "injected env (n) from ..." unless quiet is set, even when the file is missing.
    const { stdout, stderr } = await startServer({ ANTHROPIC_API_KEY: '' });
    expect(stdout + stderr).not.toContain('injected env');
  });
});

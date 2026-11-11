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
  const stderr = await new Response(proc.stderr).text();
  return { exit, stderr };
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
});

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { createApp, defaultAllowedOrigins } from './app.js';

const webDist = mkdtempSync(path.join(os.tmpdir(), 'adaptiva-api-dist-'));
writeFileSync(path.join(webDist, 'index.html'), '<!doctype html><title>spa</title>');

let server;
let base;

beforeAll(async () => {
  const app = createApp({ apiKey: 'test-key', webDist, port: 3001 });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server.close();
});

describe('default allowed origins', () => {
  test('cover the Vite dev server (3000) and the Express SPA (3001)', () => {
    const origins = defaultAllowedOrigins(3001);
    for (const origin of [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ]) {
      expect(origins).toContain(origin);
    }
  });

  test('a request from the SPA served on :3001 is not rejected by CORS', async () => {
    const res = await fetch(`${base}/api/auth/me`, {
      headers: { Origin: 'http://localhost:3001' },
    });
    expect(res.status).not.toBe(500);
  });
});

describe('/api/auth/* on the local server', () => {
  test('GET /api/auth/me answers the signed-out 401 JSON that production sends', async () => {
    const res = await fetch(`${base}/api/auth/me`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'not_authenticated' });
  });

  test('GET /api/auth/login answers 501 JSON instead of the SPA', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(501);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.error).toMatch(/auth/i);
  });

  test('POST /api/auth/login is also 501 JSON', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(501);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('unknown /api routes', () => {
  test('answer 404 JSON instead of the SPA', async () => {
    const res = await fetch(`${base}/api/nope`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('SPA fallback', () => {
  test('still serves index.html for client routes', async () => {
    const res = await fetch(`${base}/some/client/route`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>spa</title>');
  });
});

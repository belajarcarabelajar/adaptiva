import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { createApp, defaultAllowedOrigins } from './app.js';

const webDist = mkdtempSync(path.join(os.tmpdir(), 'adaptiva-api-dist-'));
writeFileSync(path.join(webDist, 'index.html'), '<!doctype html><title>spa</title>');

let server;
let base;
let aiCalls = [];
let aiImpl = async () => Response.json({ text: 'ok' });

beforeAll(async () => {
  const aiHandler = async (request) => {
    aiCalls.push({
      method: request.method,
      url: request.url,
      contentType: request.headers.get('content-type'),
      body: await request.text(),
    });
    return aiImpl(request);
  };
  const app = createApp({ aiHandler, webDist, port: 3001 });
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

describe('POST /api/ai', () => {
  test('passes method, path, content-type and raw body to aiHandler and returns its status, headers and JSON', async () => {
    aiCalls = [];
    aiImpl = async () =>
      new Response(JSON.stringify({ text: 'halo' }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-adaptiva-points': '7' },
      });
    const body = JSON.stringify({ task: 'quiz', prompt: 'apa itu sel?' });
    const res = await fetch(`${base}/api/ai`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body,
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('x-adaptiva-points')).toBe('7');
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ text: 'halo' });
    expect(aiCalls).toHaveLength(1);
    expect(aiCalls[0].method).toBe('POST');
    expect(new URL(aiCalls[0].url).pathname).toBe('/api/ai');
    expect(aiCalls[0].contentType).toBe('application/json');
    expect(aiCalls[0].body).toBe(body);
  });

  test('streams a text/event-stream body chunk by chunk', async () => {
    const encoder = new TextEncoder();
    let release;
    const released = new Promise((resolve) => {
      release = resolve;
    });
    aiImpl = async () =>
      new Response(
        new ReadableStream({
          async start(controller) {
            controller.enqueue(encoder.encode('data: {"text":"satu"}\n\n'));
            // The second chunk waits until the client has read the first,
            // so a buffered (non-streamed) response would deadlock here.
            await released;
            controller.enqueue(encoder.encode('data: {"text":"dua"}\n\n'));
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
    const res = await fetch(`${base}/api/ai`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'tutor', messages: [] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const first = await Promise.race([
      reader.read(),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 2000)),
    ]);
    if (first === 'timeout') release();
    expect(first).not.toBe('timeout');
    expect(decoder.decode(first.value)).toContain('satu');
    release();
    let rest = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value);
    }
    expect(rest).toContain('dua');
  });

  test('answers 413 JSON for a body over 1 MiB without calling aiHandler', async () => {
    aiCalls = [];
    const res = await fetch(`${base}/api/ai`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: 'x'.repeat(1048577),
    });
    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()).error).toBe('payload_too_large');
    expect(aiCalls).toHaveLength(0);
  });
});

describe('/api/gemini is gone', () => {
  test('answers the unknown-route 404 JSON instead of proxying', async () => {
    const res = await fetch(`${base}/api/gemini/v1beta/models/x:generateContent`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()).error).toMatch(/Unknown API route/);
  });
});

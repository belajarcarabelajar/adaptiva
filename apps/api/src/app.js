import express from 'express';
import cors from 'cors';
import { Readable } from 'stream';

// 3000 is the Vite dev server; `port` is this server, which serves the built SPA in `bun start`.
export function defaultAllowedOrigins(port) {
  return [...new Set([3000, Number(port)])].flatMap((p) => [
    `http://localhost:${p}`,
    `http://127.0.0.1:${p}`
  ]);
}

// Same cap as MAX_BODY_BYTES in functions/api/ai/_core.ts, which answers 413 too.
const MAX_AI_BODY_BYTES = 1048576;

async function forwardToAiHandler(req, res, aiHandler) {
  const headers = new Headers();
  if (req.headers['content-type']) headers.set('content-type', req.headers['content-type']);
  const request = new Request(`http://127.0.0.1${req.originalUrl}`, {
    method: req.method,
    headers,
    body: Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : undefined,
  });
  const response = await aiHandler(request);
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  res.flushHeaders();
  const body = Readable.fromWeb(response.body);
  req.on('close', () => body.destroy());
  for await (const chunk of body) {
    res.write(chunk);
  }
  res.end();
}

export function createApp({ aiHandler, webDist, port, allowedOrigins = defaultAllowedOrigins(port) }) {
  const app = express();

  const corsOptions = {
    origin: function (origin, callback) {
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  };

  // We only want CORS applied to API routes to avoid blocking static file serving
  // which doesn't provide an Origin header.
  app.use('/api', cors(corsOptions));

  app.post(
    '/api/ai',
    express.raw({ type: () => true, limit: MAX_AI_BODY_BYTES }),
    (req, res, next) => {
      forwardToAiHandler(req, res, aiHandler).catch(next);
    },
    (err, req, res, next) => {
      if (err?.type === 'entity.too.large') {
        res.status(413).json({ error: 'payload_too_large' });
        return;
      }
      if (res.headersSent) {
        res.destroy(err);
        return;
      }
      res.status(502).json({ error: 'Proxy error' });
    }
  );

  // Auth lives only in the Cloudflare Pages Functions; without this the SPA
  // fallback answers 200 HTML and the client fails on r.json().
  // /me answers the same signed-out 401 as functions/api/auth/me.ts, which
  // useAuth treats as "not signed in" instead of an error.
  app.get('/api/auth/me', (req, res) => {
    res.status(401).json({ error: 'not_authenticated' });
  });

  app.all(/^\/api\/auth(\/.*)?$/, (req, res) => {
    res.status(501).json({
      error: 'Auth is not implemented by the local API server; it runs only in Cloudflare Pages Functions (wrangler pages dev).'
    });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Unknown API route: ${req.method} ${req.originalUrl}` });
  });

  app.use(express.static(webDist));

  app.get(/(.*)/, (req, res) => {
    // With root, send only checks the relative part for dot segments; Express 5
    // checks every segment of an absolute path, so a checkout under ~/.cache 404s.
    res.sendFile('index.html', { root: webDist });
  });

  return app;
}

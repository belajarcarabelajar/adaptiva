import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';

// 3000 is the Vite dev server; `port` is this server, which serves the built SPA in `bun start`.
export function defaultAllowedOrigins(port) {
  return [...new Set([3000, Number(port)])].flatMap((p) => [
    `http://localhost:${p}`,
    `http://127.0.0.1:${p}`
  ]);
}

export function createApp({ apiKey, webDist, port, allowedOrigins = defaultAllowedOrigins(port) }) {
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

  app.use(
    '/api/gemini',
    createProxyMiddleware({
      target: 'https://generativelanguage.googleapis.com',
      changeOrigin: true,
      pathRewrite: {
        '^/api/gemini': '',
      },
      on: {
        proxyReq: (proxyReq) => {
          if (apiKey) {
            proxyReq.setHeader('x-goog-api-key', apiKey);
          }
        },
      },
    })
  );

  // Auth lives only in the Cloudflare Pages Functions; without this the SPA
  // fallback answers 200 HTML and the client fails on r.json().
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
    res.sendFile(path.join(webDist, 'index.html'));
  });

  return app;
}

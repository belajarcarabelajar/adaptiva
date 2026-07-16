import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// After move: __dirname = /root/adaptiva/apps/api/src (3 levels deep from monorepo root)
// - ../../../apps/web/dist = /root/adaptiva/apps/web/dist
// - ../../.env.local = /root/adaptiva/.env.local (monorepo root)
const WEB_DIST = path.resolve(__dirname, '../../../apps/web/dist');
const ENV_FILE = path.resolve(__dirname, '../../.env.local');

dotenv.config({ path: ENV_FILE });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

app.use(
  '/api/gemini',
  createProxyMiddleware({
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    pathRewrite: {
      '^/api/gemini': '',
    },
    on: {
      proxyReq: (proxyReq, req, res) => {
        if (process.env.GEMINI_API_KEY) {
          proxyReq.setHeader('x-goog-api-key', process.env.GEMINI_API_KEY);
        }
      },
    },
  })
);

app.use(express.static(WEB_DIST));

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(WEB_DIST, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

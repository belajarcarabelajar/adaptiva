import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp, defaultAllowedOrigins } from './app.js';
import { ENV_FILE, requireGeminiKey } from './env.js';
import { resolveListenHost } from './listen-host.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '../../../apps/web/dist');

dotenv.config({ path: ENV_FILE });

const port = process.env.PORT || 3001;

// If ALLOWED_ORIGINS is provided in environment variables, use that,
// otherwise use the default localhost origins.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : defaultAllowedOrigins(port);

let host;
let apiKey;
try {
  host = resolveListenHost(process.env);
  apiKey = requireGeminiKey(process.env);
} catch (err) {
  console.error(`[adaptiva-api] ${err.message}`);
  process.exit(1);
}

const app = createApp({ apiKey, webDist: WEB_DIST, port, allowedOrigins });

app.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`);
});

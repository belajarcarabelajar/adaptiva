import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp, defaultAllowedOrigins } from './app.js';
import { ENV_FILE, requireAnthropicKey } from './env.js';
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
  apiKey = requireAnthropicKey(process.env);
} catch (err) {
  console.error(`[adaptiva-api] ${err.message}`);
  process.exit(1);
}

// Imported after the checks above so a startup refusal never loads the
// Pages Function code or the Anthropic SDK.
const { handleAiRequest } = await import('../../../functions/api/ai/_core.ts');
const { createClaudeGateway } = await import('../../../functions/api/ai/_claude.ts');

const gateway = createClaudeGateway(apiKey);
// The dev server has no auth or points, so deduct and refund always succeed.
const aiHandler = (request) =>
  handleAiRequest(
    request,
    { ANTHROPIC_API_KEY: apiKey },
    {
      gateway,
      deduct: async () => ({ success: true, remainingPoints: 0, session: { userId: 'dev' } }),
      refund: async () => ({ success: true, remainingPoints: 0 }),
    }
  );

const app = createApp({ aiHandler, webDist: WEB_DIST, port, allowedOrigins });

app.listen(port, host, () => {
  console.log(`Server is running on http://${host}:${port}`);
});

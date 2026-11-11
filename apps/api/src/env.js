import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// __dirname is <root>/apps/api/src, three levels below the monorepo root.
export const ENV_FILE = path.resolve(__dirname, '../../../.env.local');

export function requireAnthropicKey(env) {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error(
      `ANTHROPIC_API_KEY is not set. Add it to ${ENV_FILE} or export it in the shell before starting the API server.`
    );
  }
  return key;
}

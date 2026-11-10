import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { ENV_FILE, requireGeminiKey } from './env.js';

describe('ENV_FILE', () => {
  test('points at .env.local in the monorepo root', () => {
    expect(path.basename(ENV_FILE)).toBe('.env.local');
    const rootPkg = path.join(path.dirname(ENV_FILE), 'package.json');
    expect(existsSync(rootPkg)).toBe(true);
    expect(JSON.parse(readFileSync(rootPkg, 'utf8')).name).toBe('adaptiva-monorepo');
  });
});

describe('requireGeminiKey', () => {
  test('returns the key when set', () => {
    expect(requireGeminiKey({ GEMINI_API_KEY: 'k-123' })).toBe('k-123');
  });

  test('throws a clear error naming the env file when the key is missing', () => {
    expect(() => requireGeminiKey({})).toThrow(/GEMINI_API_KEY.*\.env\.local/s);
    expect(() => requireGeminiKey({ GEMINI_API_KEY: '  ' })).toThrow(/GEMINI_API_KEY/);
  });
});

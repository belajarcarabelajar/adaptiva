import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { ENV_FILE, requireAnthropicKey } from './env.js';

describe('ENV_FILE', () => {
  test('points at .env.local in the monorepo root', () => {
    expect(path.basename(ENV_FILE)).toBe('.env.local');
    const rootPkg = path.join(path.dirname(ENV_FILE), 'package.json');
    expect(existsSync(rootPkg)).toBe(true);
    expect(JSON.parse(readFileSync(rootPkg, 'utf8')).name).toBe('adaptiva-monorepo');
  });
});

describe('requireAnthropicKey', () => {
  test('returns the trimmed key when set', () => {
    expect(requireAnthropicKey({ ANTHROPIC_API_KEY: ' sk-ant-123 ' })).toBe('sk-ant-123');
  });

  test('throws a clear error naming the env file when the key is missing', () => {
    expect(() => requireAnthropicKey({})).toThrow(/ANTHROPIC_API_KEY.*\.env\.local/s);
    expect(() => requireAnthropicKey({ ANTHROPIC_API_KEY: '  ' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  test('ignores GEMINI_API_KEY', () => {
    expect(() => requireAnthropicKey({ GEMINI_API_KEY: 'g-1' })).toThrow(/ANTHROPIC_API_KEY/);
  });
});

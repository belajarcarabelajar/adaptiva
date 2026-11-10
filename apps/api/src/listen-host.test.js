import { describe, expect, test } from 'bun:test';
import { resolveListenHost } from './listen-host.js';

describe('resolveListenHost', () => {
  test('defaults to loopback when HOST is unset', () => {
    expect(resolveListenHost({})).toBe('127.0.0.1');
  });

  test('treats a blank HOST as unset', () => {
    expect(resolveListenHost({ HOST: '  ' })).toBe('127.0.0.1');
  });

  test('accepts other loopback hosts', () => {
    expect(resolveListenHost({ HOST: 'localhost' })).toBe('localhost');
    expect(resolveListenHost({ HOST: '::1' })).toBe('::1');
  });

  test('refuses a non-loopback HOST without the opt-in', () => {
    expect(() => resolveListenHost({ HOST: '0.0.0.0' })).toThrow(/ALLOW_PUBLIC_HOST/);
    expect(() => resolveListenHost({ HOST: '192.168.1.5' })).toThrow(/ALLOW_PUBLIC_HOST/);
  });

  test('honours a non-loopback HOST with ALLOW_PUBLIC_HOST=1', () => {
    expect(resolveListenHost({ HOST: '0.0.0.0', ALLOW_PUBLIC_HOST: '1' })).toBe('0.0.0.0');
  });
});

import { describe, expect, test } from 'bun:test';
import { resolveListenHost } from './listen-host.js';

describe('resolveListenHost', () => {
  test('defaults to loopback when HOST is unset', () => {
    expect(resolveListenHost({})).toBe('127.0.0.1');
  });

  test('treats a blank HOST as unset', () => {
    expect(resolveListenHost({ HOST: '  ' })).toBe('127.0.0.1');
  });

  test('honours an explicit HOST', () => {
    expect(resolveListenHost({ HOST: '0.0.0.0' })).toBe('0.0.0.0');
  });
});

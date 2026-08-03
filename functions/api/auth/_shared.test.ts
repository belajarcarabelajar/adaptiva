import { describe, it, expect } from 'vitest';
import { buildSessionCookie, SESSION_COOKIE, SESSION_TTL_SECONDS } from './_shared';

describe('buildSessionCookie', () => {
  it('should build a non-secure cookie correctly', () => {
    const cookie = buildSessionCookie('test-id-123', false);
    expect(cookie).toBe(`${SESSION_COOKIE}=test-id-123; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
  });

  it('should build a secure cookie correctly', () => {
    const cookie = buildSessionCookie('test-id-456', true);
    expect(cookie).toBe(`${SESSION_COOKIE}=test-id-456; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}; Secure`);
  });

  it('should URL encode the session ID', () => {
    const sessionId = 'test/id with spaces=+!';
    const encodedId = encodeURIComponent(sessionId);
    const cookie = buildSessionCookie(sessionId, false);
    expect(cookie).toBe(`${SESSION_COOKIE}=${encodedId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
    expect(cookie).toContain(encodedId);
    expect(cookie).not.toContain('spaces=+!');
  });

  it('should handle empty session ID', () => {
    const cookie = buildSessionCookie('', false);
    expect(cookie).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
  });
});

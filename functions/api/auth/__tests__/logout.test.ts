import { describe, it, expect, vi } from 'vitest';
import { onRequestGet, onRequestPost } from '../logout';
import { type Env, SESSION_COOKIE } from '../_shared';

describe('logout', () => {
  it('should redirect to / and clear cookie, and call deleteSession if SESSIONS is available', async () => {
    const mockRequest = new Request('https://example.com/', {
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=test-session-id`,
      }),
    });

    const mockEnv = {
      SESSIONS: {
        delete: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Env;

    const mockContext = {
      env: mockEnv,
      request: mockRequest,
    } as any;

    const response = await onRequestGet(mockContext);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE}=;`);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(response.headers.get('Set-Cookie')).toContain('Secure'); // Since it's https
    expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith('sess:test-session-id');
  });

  it('should clear cookie without Secure flag for HTTP requests (like localhost)', async () => {
    const mockRequest = new Request('http://localhost:3000/', {
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=test-session-id`,
      }),
    });

    const mockEnv = {
      SESSIONS: {
        delete: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Env;

    const mockContext = {
      env: mockEnv,
      request: mockRequest,
    } as any;

    const response = await onRequestGet(mockContext);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE}=;`);
    expect(response.headers.get('Set-Cookie')).not.toContain('Secure'); // Since it's http and localhost
    expect(mockEnv.SESSIONS.delete).toHaveBeenCalledWith('sess:test-session-id');
  });

  it('should not throw and still redirect if SESSIONS env is not present', async () => {
    const mockRequest = new Request('https://example.com/', {
      headers: new Headers({
        cookie: `${SESSION_COOKIE}=test-session-id`,
      }),
    });

    const mockEnv = {} as unknown as Env;

    const mockContext = {
      env: mockEnv,
      request: mockRequest,
    } as any;

    const response = await onRequestGet(mockContext);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE}=;`);
    expect(response.headers.get('Set-Cookie')).toContain('Secure');
  });

  it('onRequestPost should be exactly the same as onRequestGet', () => {
    expect(onRequestPost).toBe(onRequestGet);
  });
});

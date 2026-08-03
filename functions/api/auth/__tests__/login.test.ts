import { describe, it, expect, vi } from 'vitest';
import { onRequestGet } from '../login';
import type { Env, PagesContext } from '../_shared';

describe('login route (onRequestGet)', () => {
  it('redirects to /?auth_error=not_configured if environment variables are missing', async () => {
    const mockRequest = new Request('http://localhost/api/auth/login');
    const mockEnv = {} as Env;
    const context = {
      request: mockRequest,
      env: mockEnv,
    } as unknown as PagesContext<Env>;

    const response = await onRequestGet(context) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/?auth_error=not_configured');
  });

  it('redirects to /?auth_error=not_configured if GOOGLE_CLIENT_ID is missing', async () => {
    const mockRequest = new Request('http://localhost/api/auth/login');
    const mockEnv = {
      GOOGLE_CLIENT_SECRET: 'secret',
      SESSIONS: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    } as unknown as Env;
    const context = {
      request: mockRequest,
      env: mockEnv,
    } as unknown as PagesContext<Env>;

    const response = await onRequestGet(context) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/?auth_error=not_configured');
  });

  it('generates state, saves to KV, and redirects to Google authorize URL', async () => {
    const mockRequest = new Request('http://localhost/api/auth/login');
    const mockEnv = {
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      SESSIONS: {
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
        delete: vi.fn(),
      }
    } as unknown as Env;

    const context = {
      request: mockRequest,
      env: mockEnv,
    } as unknown as PagesContext<Env>;

    const response = await onRequestGet(context) as Response;

    expect(response.status).toBe(302);

    const location = response.headers.get('Location');
    expect(location).toBeTruthy();

    const url = new URL(location!);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');

    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost/api/auth/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');

    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();

    // Check if the state was saved in the mock KV SESSIONS
    expect(mockEnv.SESSIONS.put).toHaveBeenCalledWith(
      `oauth_state:${state}`,
      expect.any(String), // We can't perfectly predict JSON string for Date.now() but expect.any(String) is fine
      { expirationTtl: 600 }
    );
  });
});

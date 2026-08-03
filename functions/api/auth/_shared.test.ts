import { describe, it, expect } from 'vitest';
import {
  randomHex,
  randomToken,
  timingSafeEqual,
  parseCookies,
  buildSessionCookie,
  buildClearCookie,
  getOrigin,
  isHttps,
  isEmailAllowed,
  jsonResponse,
  redirectResponse,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS
} from './_shared';

describe('auth _shared helpers', () => {
  describe('Crypto helpers', () => {
    describe('randomHex', () => {
      it('generates a 64-character hex string by default (32 bytes)', () => {
        const hex = randomHex();
        expect(hex).toHaveLength(64);
        expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
      });

      it('generates a hex string of the specified byte length', () => {
        const hex = randomHex(16);
        expect(hex).toHaveLength(32);
        expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
      });
    });

    describe('randomToken', () => {
      it('generates a base64url string without padding', () => {
        const token = randomToken();
        // 32 bytes in base64url length is ceil(32 * 4 / 3) = 43 chars (no padding)
        expect(token).toHaveLength(43);
        expect(/^[A-Za-z0-9\-_]+$/.test(token)).toBe(true);
      });

      it('generates a base64url string of the specified byte length', () => {
        const token = randomToken(16);
        // 16 bytes is 22 chars in base64url
        expect(token).toHaveLength(22);
        expect(/^[A-Za-z0-9\-_]+$/.test(token)).toBe(true);
      });
    });

    describe('timingSafeEqual', () => {
      it('returns true for identical strings', () => {
        expect(timingSafeEqual('hello', 'hello')).toBe(true);
      });

      it('returns false for strings of different lengths', () => {
        expect(timingSafeEqual('hello', 'hello ')).toBe(false);
      });

      it('returns false for different strings of the same length', () => {
        expect(timingSafeEqual('hello', 'world')).toBe(false);
      });
    });
  });

  describe('Cookie helpers', () => {
    describe('parseCookies', () => {
      it('returns empty object if no cookie header is present', () => {
        const request = new Request('http://localhost');
        expect(parseCookies(request)).toEqual({});
      });

      it('parses a single cookie correctly', () => {
        const request = new Request('http://localhost', {
          headers: { cookie: 'key=value' }
        });
        expect(parseCookies(request)).toEqual({ key: 'value' });
      });

      it('parses multiple cookies correctly', () => {
        const request = new Request('http://localhost', {
          headers: { cookie: 'key1=value1; key2=value2' }
        });
        expect(parseCookies(request)).toEqual({ key1: 'value1', key2: 'value2' });
      });

      it('URL decodes values correctly', () => {
        const request = new Request('http://localhost', {
          headers: { cookie: 'key=value%20with%20spaces' }
        });
        expect(parseCookies(request)).toEqual({ key: 'value with spaces' });
      });

      it('ignores malformed cookie parts without equals sign', () => {
        const request = new Request('http://localhost', {
          headers: { cookie: 'key=value; malformed; key2=value2' }
        });
        expect(parseCookies(request)).toEqual({ key: 'value', key2: 'value2' });
      });

      it('ignores cookies with empty keys', () => {
        const request = new Request('http://localhost', {
          headers: { cookie: '=value; key=value2' }
        });
        expect(parseCookies(request)).toEqual({ key: 'value2' });
      });
    });

    describe('buildSessionCookie', () => {
      it('builds a secure cookie correctly', () => {
        const cookie = buildSessionCookie('my-session-id', true);
        expect(cookie).toContain(`${SESSION_COOKIE}=my-session-id`);
        expect(cookie).toContain('Path=/');
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
        expect(cookie).toContain('Secure');
      });

      it('builds a non-secure cookie correctly', () => {
        const cookie = buildSessionCookie('my-session-id', false);
        expect(cookie).toContain(`${SESSION_COOKIE}=my-session-id`);
        expect(cookie).not.toContain('Secure');
      });

      it('URI encodes the session ID', () => {
        const cookie = buildSessionCookie('session id', false);
        expect(cookie).toContain(`${SESSION_COOKIE}=session%20id`);
      });
    });

    describe('buildClearCookie', () => {
      it('builds a secure clear cookie correctly', () => {
        const cookie = buildClearCookie(true);
        expect(cookie).toContain(`${SESSION_COOKIE}=`);
        expect(cookie).toContain('Max-Age=0');
        expect(cookie).toContain('Secure');
      });

      it('builds a non-secure clear cookie correctly', () => {
        const cookie = buildClearCookie(false);
        expect(cookie).not.toContain('Secure');
      });
    });
  });

  describe('URL helpers', () => {
    describe('getOrigin', () => {
      it('returns AUTH_BASE_URL if set in env, stripping trailing slashes', () => {
        const request = new Request('http://localhost/some/path');
        expect(getOrigin(request, { AUTH_BASE_URL: 'https://example.com/' } as any)).toBe('https://example.com');
      });

      it('returns the request URL origin if AUTH_BASE_URL is not set', () => {
        const request = new Request('https://example.com/some/path');
        expect(getOrigin(request, {} as any)).toBe('https://example.com');
      });
    });

    describe('isHttps', () => {
      it('returns true if AUTH_BASE_URL starts with https', () => {
        const request = new Request('http://localhost');
        expect(isHttps(request, { AUTH_BASE_URL: 'https://example.com' } as any)).toBe(true);
      });

      it('returns false if AUTH_BASE_URL starts with http', () => {
        const request = new Request('https://localhost');
        expect(isHttps(request, { AUTH_BASE_URL: 'http://example.com' } as any)).toBe(false);
      });

      it('returns true if x-forwarded-proto contains https', () => {
        const request = new Request('http://example.com', {
          headers: { 'x-forwarded-proto': 'https, http' }
        });
        expect(isHttps(request, {} as any)).toBe(true);
      });

      it('returns true if cf-visitor contains https', () => {
        const request = new Request('http://example.com', {
          headers: { 'cf-visitor': '{"scheme":"https"}' }
        });
        expect(isHttps(request, {} as any)).toBe(true);
      });

      it('returns true if request protocol is https:', () => {
        const request = new Request('https://example.com');
        expect(isHttps(request, {} as any)).toBe(true);
      });

      it('returns false for localhost and 127.0.0.1 (unless overridden by headers)', () => {
        const req1 = new Request('http://localhost:3000');
        expect(isHttps(req1, {} as any)).toBe(false);

        const req2 = new Request('http://127.0.0.1:3000');
        expect(isHttps(req2, {} as any)).toBe(false);
      });

      it('returns true for normal http URLs that are not localhost (fallback assumption)', () => {
         const request = new Request('http://example.com');
         expect(isHttps(request, {} as any)).toBe(true);
      });
    });
  });

  describe('isEmailAllowed', () => {
    it('returns true if ALLOWED_EMAIL_DOMAINS is undefined', () => {
      expect(isEmailAllowed({} as any, 'user@example.com')).toBe(true);
    });

    it('returns true if ALLOWED_EMAIL_DOMAINS is empty', () => {
      expect(isEmailAllowed({ ALLOWED_EMAIL_DOMAINS: '   ' } as any, 'user@example.com')).toBe(true);
    });

    it('returns true if domain matches a single allowed domain', () => {
      expect(isEmailAllowed({ ALLOWED_EMAIL_DOMAINS: 'example.com' } as any, 'user@example.com')).toBe(true);
    });

    it('returns true if domain matches one of multiple allowed domains', () => {
      const env = { ALLOWED_EMAIL_DOMAINS: 'test.com, example.com , other.com' } as any;
      expect(isEmailAllowed(env, 'user@example.com')).toBe(true);
      expect(isEmailAllowed(env, 'user@test.com')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isEmailAllowed({ ALLOWED_EMAIL_DOMAINS: 'EXAMPLE.COM' } as any, 'user@example.com')).toBe(true);
      expect(isEmailAllowed({ ALLOWED_EMAIL_DOMAINS: 'example.com' } as any, 'user@EXAMPLE.COM')).toBe(true);
    });

    it('returns false if domain does not match allowed list', () => {
      expect(isEmailAllowed({ ALLOWED_EMAIL_DOMAINS: 'example.com' } as any, 'user@test.com')).toBe(false);
    });

    it('handles malformed emails gracefully', () => {
      expect(isEmailAllowed({ ALLOWED_EMAIL_DOMAINS: 'example.com' } as any, 'notanemail')).toBe(false);
    });
  });

  describe('Response helpers', () => {
    describe('jsonResponse', () => {
      it('returns a Response with stringified JSON and correct content-type', async () => {
        const request = new Request('http://localhost');
        const response = jsonResponse(request, { key: 'value' });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/json');
        const body = await response.json();
        expect(body).toEqual({ key: 'value' });
      });

      it('uses the request origin for Access-Control-Allow-Origin', () => {
        const request = new Request('http://localhost', { headers: { origin: 'https://example.com' } });
        const response = jsonResponse(request, {});
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
      });

      it('uses * for Access-Control-Allow-Origin if origin header is missing', () => {
        const request = new Request('http://localhost');
        const response = jsonResponse(request, {});
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      });

      it('allows custom status and extra headers', () => {
        const request = new Request('http://localhost');
        const response = jsonResponse(request, {}, 400, { 'X-Custom-Header': 'custom-value' });
        expect(response.status).toBe(400);
        expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
      });
    });

    describe('redirectResponse', () => {
      it('returns a 302 Response with the correct Location header', () => {
        const response = redirectResponse('https://example.com/redirect');
        expect(response.status).toBe(302);
        expect(response.headers.get('Location')).toBe('https://example.com/redirect');
      });

      it('allows custom status and extra headers', () => {
        const response = redirectResponse('https://example.com/redirect', 301, { 'X-Custom-Header': 'custom-value' });
        expect(response.status).toBe(301);
        expect(response.headers.get('Location')).toBe('https://example.com/redirect');
        expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
      });
    });
  });
});

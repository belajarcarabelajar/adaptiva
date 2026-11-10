import { describe, it, expect, vi } from 'vitest';
import { deductUserPoints, type Env, type Session } from '../_shared';

// The balance lives in the account ledger (points:<userId>), not in the session.
function memoryKv(entries: Record<string, string>) {
  const store = new Map(Object.entries(entries));
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

const session: Session = {
  userId: '123',
  email: 'test@example.com',
  name: 'Test User',
  picture: '',
  accessToken: 'access-token',
  expiresAt: Date.now() + 10000,
  createdAt: Date.now(),
};

const withCookie = () =>
  new Request('http://localhost', {
    headers: new Headers({ cookie: 'adaptiva_sess=valid-sid' }),
  });

describe('deductUserPoints', () => {
  it('should return failure if sid cookie is missing', async () => {
    const mockRequest = new Request('http://localhost', {
      headers: new Headers(),
    });
    const mockEnv = { SESSIONS: { get: vi.fn(), put: vi.fn() } } as unknown as Env;

    const result = await deductUserPoints(mockRequest, mockEnv, 10);
    expect(result).toEqual({ success: false, remainingPoints: 0, session: null });
  });

  it('should successfully deduct points and update the account ledger', async () => {
    const kv = memoryKv({ 'sess:valid-sid': JSON.stringify(session), 'points:123': '50' });
    const mockEnv = { SESSIONS: kv } as unknown as Env;

    const result = await deductUserPoints(withCookie(), mockEnv, 10);

    expect(result.success).toBe(true);
    expect(result.remainingPoints).toBe(40);
    expect(kv.get).toHaveBeenCalledWith('sess:valid-sid');
    expect(kv.store.get('points:123')).toBe('40');
  });

  it('should return failure and 0 remaining points if session data is invalid JSON', async () => {
    const mockEnv = {
      SESSIONS: {
        get: vi.fn().mockResolvedValue('this is not valid json'),
        put: vi.fn(),
      },
    } as unknown as Env;

    const result = await deductUserPoints(withCookie(), mockEnv, 10);

    expect(result.success).toBe(false);
    expect(result.remainingPoints).toBe(0);
    expect(result.session).toBeNull();
  });

  it('should seed the initial grant for an account without a ledger entry and deduct from it', async () => {
    const kv = memoryKv({ 'sess:valid-sid': JSON.stringify(session) });
    const mockEnv = { SESSIONS: kv } as unknown as Env;

    // DEFAULT_INITIAL_POINTS is 100
    const result = await deductUserPoints(withCookie(), mockEnv, 10);

    expect(result.success).toBe(true);
    expect(result.remainingPoints).toBe(90);
    expect(kv.store.get('points:123')).toBe('90');
  });

  it('should fail if points are insufficient', async () => {
    const kv = memoryKv({ 'sess:valid-sid': JSON.stringify(session), 'points:123': '5' });
    const mockEnv = { SESSIONS: kv } as unknown as Env;

    const result = await deductUserPoints(withCookie(), mockEnv, 10);

    expect(result.success).toBe(false);
    expect(result.remainingPoints).toBe(5);
    expect(result.session).not.toBeNull();
    expect(kv.store.get('points:123')).toBe('5');
  });
});

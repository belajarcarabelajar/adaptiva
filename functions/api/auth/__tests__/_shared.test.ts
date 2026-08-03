import { describe, it, expect, vi } from 'vitest';
import { deductUserPoints, type Env, type Session } from '../_shared';

describe('deductUserPoints', () => {
  it('should return failure if sid cookie is missing', async () => {
    const mockRequest = new Request('http://localhost', {
      headers: new Headers(),
    });
    const mockEnv = { SESSIONS: { get: vi.fn(), put: vi.fn() } } as unknown as Env;

    const result = await deductUserPoints(mockRequest, mockEnv, 10);
    expect(result).toEqual({ success: false, remainingPoints: 0, session: null });
  });

  it('should successfully deduct points and update session', async () => {
    const mockRequest = new Request('http://localhost', {
      headers: new Headers({
        cookie: 'adaptiva_sess=valid-sid',
      }),
    });

    const mockSession: Session = {
      user: {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        picture: '',
      },
      points: 50,
      createdAt: Date.now(),
    };

    const mockEnv = {
      SESSIONS: {
        get: vi.fn().mockResolvedValue(JSON.stringify(mockSession)),
        put: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Env;

    const result = await deductUserPoints(mockRequest, mockEnv, 10);

    expect(result.success).toBe(true);
    expect(result.remainingPoints).toBe(40);
    expect(mockEnv.SESSIONS.get).toHaveBeenCalledWith('sess:valid-sid');
    expect(mockEnv.SESSIONS.put).toHaveBeenCalled();
  });

  it('should return failure and 0 remaining points if session data is invalid JSON', async () => {
    const mockRequest = new Request('http://localhost', {
      headers: new Headers({
        cookie: 'adaptiva_sess=valid-sid',
      }),
    });

    const mockEnv = {
      SESSIONS: {
        get: vi.fn().mockResolvedValue('this is not valid json'),
        put: vi.fn(),
      },
    } as unknown as Env;

    const result = await deductUserPoints(mockRequest, mockEnv, 10);

    expect(result.success).toBe(false);
    expect(result.remainingPoints).toBe(0);
    expect(result.session).toBeNull();
  });

  it('should handle missing points property gracefully, fallback to default, and deduct if possible', async () => {
    const mockRequest = new Request('http://localhost', {
      headers: new Headers({
        cookie: 'adaptiva_sess=valid-sid',
      }),
    });

    const mockSession: Partial<Session> = {
      user: {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        picture: '',
      },
      createdAt: Date.now(),
      // missing points
    };

    const mockEnv = {
      SESSIONS: {
        get: vi.fn().mockResolvedValue(JSON.stringify(mockSession)),
        put: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Env;

    // DEFAULT_INITIAL_POINTS is 100 in _shared.ts
    const result = await deductUserPoints(mockRequest, mockEnv, 10);

    expect(result.success).toBe(true);
    expect(result.remainingPoints).toBe(90); // 100 - 10
  });

  it('should fail if points are insufficient', async () => {
     const mockRequest = new Request('http://localhost', {
      headers: new Headers({
        cookie: 'adaptiva_sess=valid-sid',
      }),
    });

    const mockSession: Session = {
      user: {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        picture: '',
      },
      points: 5,
      createdAt: Date.now(),
    };

    const mockEnv = {
      SESSIONS: {
        get: vi.fn().mockResolvedValue(JSON.stringify(mockSession)),
        put: vi.fn(),
      },
    } as unknown as Env;

    const result = await deductUserPoints(mockRequest, mockEnv, 10);

    expect(result.success).toBe(false);
    expect(result.remainingPoints).toBe(5);
    expect(result.session).not.toBeNull();
  });
});

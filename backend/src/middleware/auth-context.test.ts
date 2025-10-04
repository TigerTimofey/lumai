import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../utils/api-error.js';

const verifyIdToken = vi.fn();
const getUserById = vi.fn();
const updateUserDocument = vi.fn();

vi.mock('../config/env.js', () => ({
  default: {
    SESSION_IDLE_MINUTES: 1
  }
}));

vi.mock('../config/firebase.js', () => ({
  firebaseAuth: vi.fn(() => ({
    verifyIdToken
  }))
}));

vi.mock('../repositories/user.repo.js', () => ({
  getUserById,
  updateUserDocument
}));

import { authContext } from './auth-context.js';

const createRequest = (token?: string) => ({
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

describe('authContext middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUserDocument.mockResolvedValue(undefined);
  });

  it('rejects requests without bearer token', async () => {
    const req = createRequest();
    const next = vi.fn();

    await authContext(req as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    const error = next.mock.calls[0][0] as ApiError;
    expect(error.status).toBe(401);
    expect(error.message).toBe('Unauthorized');
  });

  it('rejects when session idle timeout exceeded', async () => {
    const req = createRequest('token-123');
    const next = vi.fn();
    verifyIdToken.mockResolvedValue({ uid: 'user-1' });
    getUserById.mockResolvedValue({
      lastActivityAt: {
        toMillis: () => Date.now() - 10 * 60 * 1000
      }
    });

    await authContext(req as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
    const error = next.mock.calls[0][0] as ApiError;
    expect(error.status).toBe(401);
    expect(error.message).toBe('Session expired due to inactivity');
    expect(updateUserDocument).not.toHaveBeenCalled();
  });

  it('allows request when session is active and updates activity timestamp', async () => {
    const req = createRequest('token-456');
    const next = vi.fn();
    verifyIdToken.mockResolvedValue({ uid: 'user-2' });
    getUserById.mockResolvedValue({
      lastActivityAt: {
        toMillis: () => Date.now() - 20 * 1000
      }
    });

    await authContext(req as any, {} as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(updateUserDocument).toHaveBeenCalledWith('user-2', expect.objectContaining({
      lastActivityAt: expect.anything()
    }));
  });
});

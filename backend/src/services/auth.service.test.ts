import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ApiError } from '../utils/api-error.js';

const axiosPost = vi.fn();
const mockGetUserById = vi.fn();
const mockUpdateUserDocument = vi.fn();
const mockPrivacyParse = vi.fn();
const mockTotpVerify = vi.fn();

vi.mock('axios', () => ({
  default: {
    post: axiosPost,
    isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError)
  }
}));

vi.mock('../config/env.js', () => ({
  default: {
    WEB_API_KEY: 'test-key',
    FRONTEND_URL: 'http://localhost:5173',
    SESSION_IDLE_MINUTES: 0
  }
}));

vi.mock('../repositories/user.repo.js', () => ({
  getUserById: mockGetUserById,
  createUserDocument: vi.fn(),
  updateUserDocument: mockUpdateUserDocument,
  setUserMfa: vi.fn()
}));

vi.mock('../repositories/consent.repo.js', () => ({
  setConsents: vi.fn()
}));

vi.mock('../domain/validation.js', () => ({
  privacyPreferencesSchema: {
    parse: mockPrivacyParse
  }
}));

vi.mock('speakeasy', () => ({
  default: {
    totp: {
      verify: mockTotpVerify
    },
    generateSecret: vi.fn(() => ({
      base32: 'BASE32',
      otpauth_url: 'otpauth://totp/test'
    }))
  }
}));

vi.mock('../config/firebase.js', () => ({
  firebaseAuth: vi.fn(() => ({
    createUser: vi.fn(),
    generateEmailVerificationLink: vi.fn(),
    generatePasswordResetLink: vi.fn()
  })),
  firestore: vi.fn()
}));

import { loginWithEmailPassword, refreshIdToken } from './auth.service.js';

const baseResponse = {
  localId: 'user-123',
  email: 'user@example.com',
  emailVerified: true,
  refreshToken: 'refresh-token',
  idToken: 'id-token',
  expiresIn: '3600'
};

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserById.mockResolvedValue({
      email: 'user@example.com',
      mfa: {
        enabled: true,
        secret: 'SECRET'
      }
    });
    mockPrivacyParse.mockReturnValue({
      profileVisibility: 'private',
      shareWithCoaches: false,
      shareWithResearch: false,
      emailNotifications: {}
    });
    axiosPost.mockResolvedValue({ data: baseResponse });
    mockTotpVerify.mockReturnValue(true);
  });

  it('throws when MFA is enabled and code missing', async () => {
    await expect(loginWithEmailPassword('user@example.com', 'pass123')).rejects.toMatchObject({
      status: 403,
      message: 'One-time 2FA code required'
    } satisfies Partial<ApiError>);
    expect(mockTotpVerify).not.toHaveBeenCalled();
  });

  it('throws when MFA code is invalid', async () => {
    mockTotpVerify.mockReturnValueOnce(false);

    await expect(
      loginWithEmailPassword('user@example.com', 'pass123', '000000')
    ).rejects.toMatchObject({
      status: 403,
      message: 'Invalid one-time code'
    } satisfies Partial<ApiError>);
    expect(mockTotpVerify).toHaveBeenCalledWith({
      secret: 'SECRET',
      encoding: 'base32',
      token: '000000',
      window: 1
    });
  });

  it('returns tokens when MFA code valid', async () => {
    const result = await loginWithEmailPassword('user@example.com', 'pass123', '654321');

    expect(result).toEqual(
      expect.objectContaining({
        uid: 'user-123',
        idToken: 'id-token',
        refreshToken: 'refresh-token',
        expiresIn: '3600',
        user: expect.objectContaining({ mfa: expect.objectContaining({ enabled: true }) })
      })
    );

    expect(mockTotpVerify).toHaveBeenCalledWith({
      secret: 'SECRET',
      encoding: 'base32',
      token: '654321',
      window: 1
    });
  });

  it('exchanges refresh token for new id token', async () => {
    axiosPost.mockResolvedValueOnce({
      data: {
        user_id: 'user-123',
        id_token: 'new-id-token',
        refresh_token: 'new-refresh-token',
        expires_in: '5400'
      }
    });

    const result = await refreshIdToken('refresh-token');

    expect(axiosPost).toHaveBeenCalledWith(
      'https://securetoken.googleapis.com/v1/token?key=test-key',
      {
        grant_type: 'refresh_token',
        refresh_token: 'refresh-token'
      }
    );

    expect(result).toEqual({
      uid: 'user-123',
      idToken: 'new-id-token',
      refreshToken: 'new-refresh-token',
      expiresIn: '5400'
    });
  });
});

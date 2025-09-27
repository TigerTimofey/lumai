import axios from "axios";
import { Timestamp } from "firebase-admin/firestore";
import speakeasy from "speakeasy";
import { firebaseAuth } from "../config/firebase.js";
import env from "../config/env.js";
import {
  createUserDocument,
  getUserById,
  setUserMfa,
  updateUserDocument
} from "../repositories/user.repo.js";
import { setConsents } from "../repositories/consent.repo.js";
import { privacyPreferencesSchema } from "../domain/validation.js";
import { badRequest, forbidden, internalError } from "../utils/api-error.js";

const IDENTITY_BASE = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN_BASE = "https://securetoken.googleapis.com/v1";

interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

const ensureMfa = (code: string | undefined, secret: string | undefined) => {
  if (!secret) {
    return true;
  }

  if (!code) {
    throw forbidden("One-time 2FA code required");
  }

  const verified = speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: code,
    window: 1
  });

  if (!verified) {
    throw forbidden("Invalid one-time code");
  }

  return true;
};

const ensureUserBootstrap = async (
  uid: string,
  email: string,
  emailVerified: boolean
) => {
  const existing = await getUserById(uid);
  if (existing) {
    return existing;
  }

  const defaultPrivacy = privacyPreferencesSchema.parse({});

  await createUserDocument(uid, {
    email,
    emailVerified,
    profileVersionId: null,
    privacy: {
      profileVisibility: defaultPrivacy.profileVisibility,
      shareWithCoaches: defaultPrivacy.shareWithCoaches,
      shareWithResearch: defaultPrivacy.shareWithResearch,
      emailNotifications: defaultPrivacy.emailNotifications
    },
    mfa: {
      enabled: false
    }
  });

  await setConsents(uid, {
    agreements: {},
    sharingPreferences: {
      shareWithCoaches: defaultPrivacy.shareWithCoaches,
      shareWithResearch: defaultPrivacy.shareWithResearch
    },
    notifications: defaultPrivacy.emailNotifications,
    auditTrail: []
  });

  return getUserById(uid);
};

export const registerUser = async ({ email, password, displayName }: RegisterInput) => {
  try {
    const auth = firebaseAuth();
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
      disabled: false
    });

    const defaultPrivacy = privacyPreferencesSchema.parse({});

    await createUserDocument(userRecord.uid, {
      email: userRecord.email ?? email,
      emailVerified: userRecord.emailVerified,
      profileVersionId: null,
      privacy: {
        profileVisibility: defaultPrivacy.profileVisibility,
        shareWithCoaches: defaultPrivacy.shareWithCoaches,
        shareWithResearch: defaultPrivacy.shareWithResearch,
        emailNotifications: defaultPrivacy.emailNotifications
      },
      mfa: {
        enabled: false
      }
    });

    await setConsents(userRecord.uid, {
      agreements: {},
      sharingPreferences: {
        shareWithCoaches: defaultPrivacy.shareWithCoaches,
        shareWithResearch: defaultPrivacy.shareWithResearch
      },
      notifications: defaultPrivacy.emailNotifications,
      auditTrail: []
    });

    const verificationLink = await auth.generateEmailVerificationLink(email);

    return {
      userRecord,
      verificationLink
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw badRequest(error.response?.data?.error?.message ?? "Registration failed");
    }

    throw internalError("Failed to register user", error);
  }
};

export const loginWithEmailPassword = async (
  email: string,
  password: string,
  mfaCode?: string
) => {
  try {
    const { data } = await axios.post(
      `${IDENTITY_BASE}/accounts:signInWithPassword?key=${env.WEB_API_KEY}`,
      {
        email,
        password,
        returnSecureToken: true
      }
    );

    if (!data.emailVerified) {
      throw forbidden("Email not verified. Please confirm your account before logging in.");
    }

    const user = await ensureUserBootstrap(
      data.localId,
      data.email ?? email,
      Boolean(data.emailVerified)
    );
    if (user?.mfa?.enabled) {
      ensureMfa(mfaCode, user.mfa.secret ?? undefined);
    }

    return {
      uid: data.localId,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      user
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error?.message ?? "Login failed";
      throw badRequest(message);
    }

    throw internalError("Login failed", error);
  }
};

export const loginWithOAuth = async (
  providerId: "google.com" | "github.com",
  tokens: { idToken?: string; accessToken?: string },
  mfaCode?: string
) => {
  try {
    const params = new URLSearchParams();
    params.append("providerId", providerId);
    if (tokens.idToken) params.append("id_token", tokens.idToken);
    if (tokens.accessToken) params.append("access_token", tokens.accessToken);

    const requestPayload = {
      postBody: params.toString(),
      requestUri: env.FRONTEND_URL,
      returnIdpCredential: true,
      returnSecureToken: true
    };

    const { data } = await axios.post(
      `${IDENTITY_BASE}/accounts:signInWithIdp?key=${env.WEB_API_KEY}`,
      requestPayload
    );

    const emailVerified = Boolean(data.emailVerified ?? data.verifiedEmail ?? true);
    if (!emailVerified) {
      throw forbidden("Email not verified for this provider account.");
    }

    const bootstrapEmail = data.email ?? (await getUserById(data.localId))?.email ?? "";
    if (!bootstrapEmail) {
      throw internalError("Unable to resolve OAuth user email");
    }

    const user = await ensureUserBootstrap(data.localId, bootstrapEmail, emailVerified);
    if (user?.mfa?.enabled) {
      ensureMfa(mfaCode, user.mfa.secret ?? undefined);
    }

    await updateUserDocument(data.localId, {
      emailVerified
    });

    return {
      uid: data.localId,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      user: await getUserById(data.localId)
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error?.message ?? "OAuth login failed";
      throw badRequest(message);
    }

    throw internalError("OAuth login failed", error);
  }
};

export const refreshIdToken = async (refreshToken: string) => {
  try {
    const { data } = await axios.post(
      `${SECURE_TOKEN_BASE}/token?key=${env.WEB_API_KEY}`,
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }
    );

    return {
      uid: data.user_id,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error?.message ?? "Refresh failed";
      throw badRequest(message);
    }

    throw internalError("Refresh failed", error);
  }
};

export const sendVerificationEmail = async (email: string) => {
  try {
    const auth = firebaseAuth();
    const link = await auth.generateEmailVerificationLink(email);
    return { link };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw badRequest(error.response?.data?.error?.message ?? "Failed to create link");
    }

    throw internalError("Failed to create verification link", error);
  }
};

export const sendPasswordResetEmail = async (email: string) => {
  try {
    const auth = firebaseAuth();
    const link = await auth.generatePasswordResetLink(email);
    return { link };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw badRequest(error.response?.data?.error?.message ?? "Failed to create link");
    }

    throw internalError("Failed to create password reset link", error);
  }
};

export const enrollMfa = async (uid: string, label?: string) => {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: label ?? "Numbers Don't Lie Wellness"
  });

  await setUserMfa(uid, {
    enabled: false,
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url
  });

  return {
    base32: secret.base32,
    otpauthUrl: secret.otpauth_url
  };
};

export const activateMfa = async (uid: string, code: string) => {
  const user = await getUserById(uid);
  if (!user?.mfa?.secret) {
    throw badRequest("MFA not initialized");
  }

  ensureMfa(code, user.mfa.secret ?? undefined);

  await setUserMfa(uid, {
    enabled: true,
    secret: user.mfa.secret,
    otpauthUrl: user.mfa.otpauthUrl,
    enrolledAt: Timestamp.now()
  });

  return { enabled: true };
};

export const disableMfa = async (uid: string) => {
  await setUserMfa(uid, {
    enabled: false,
    secret: null,
    otpauthUrl: null
  });

  return { enabled: false };
};

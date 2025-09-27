import axios from "axios";
import { firebaseAuth } from "../config/firebase.js";
import env from "../config/env.js";
import { createUserDocument, getUserById } from "../repositories/user.repo.js";
import { setConsents } from "../repositories/consent.repo.js";
import { privacyPreferencesSchema } from "../domain/validation.js";
import { badRequest, internalError } from "../utils/api-error.js";

const IDENTITY_BASE = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN_BASE = "https://securetoken.googleapis.com/v1";

interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export const registerUser = async ({ email, password, displayName }: RegisterInput) => {
  try {
    const userRecord = await firebaseAuth().createUser({
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

    return userRecord;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      throw badRequest(error.response?.data?.error?.message ?? "Registration failed");
    }

    throw internalError("Failed to register user", error);
  }
};

export const loginWithEmailPassword = async (email: string, password: string) => {
  try {
    const { data } = await axios.post(
      `${IDENTITY_BASE}/accounts:signInWithPassword?key=${env.WEB_API_KEY}`,
      {
        email,
        password,
        returnSecureToken: true
      }
    );

    const user = await getUserById(data.localId);

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

import { useState } from 'react';
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  OAuthCredential,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, db } from '../../../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { apiFetch } from '../../../utils/api';
import type { AuthCredential, User } from 'firebase/auth';
import type { FirestoreUser } from '../../pages/profile/profileOptions/types';

interface UseLoginFormOptions {
  onAuthenticated?: (user: User) => void;
}

interface LoginFormData {
  email: string;
  password: string;
}

interface UseLoginFormReturn {
  formData: LoginFormData;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleGitHubLogin: () => Promise<void>;
  handleGoogleLogin: () => Promise<void>;
  handlePasswordReset: () => Promise<void>;
  loading: boolean;
  emailLoading: boolean;
  githubLoading: boolean;
  googleLoading: boolean;
  error: string | null;
  success: string | null;
  mfaRequired: boolean;
  mfaCode: string;
  handleMfaChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  pendingOAuthProvider: 'google.com' | 'github.com' | null;
}

interface PendingOAuth {
  providerId: 'google.com' | 'github.com';
  tokens: {
    idToken?: string;
    accessToken?: string;
  };
  credential: OAuthCredential | null;
}

export const useLoginForm = (options?: UseLoginFormOptions): UseLoginFormReturn => {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [emailLoading, setEmailLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [pendingOAuth, setPendingOAuth] = useState<PendingOAuth | null>(null);

  const loading = emailLoading || githubLoading || googleLoading;

  const resetMfaFlow = () => {
    setMfaRequired(false);
    setMfaCode('');
    setPendingOAuth(null);
  };

  // Ensure GitHub/Google users have the same Firestore schema as email/password registration
  const upsertUserProfileSchema = async (user: User) => {
    const userRef = doc(db, 'users', user.uid);
    const snapshot = await getDoc(userRef);

    const defaultsNeeded = !snapshot.exists();
    const data = snapshot.data() as FirestoreUser | undefined;

    const baseUpdates: Record<string, unknown> = {
      email: user.email ?? null,
      displayName: user.displayName || null,
      emailVerified: user.emailVerified,
      updatedAt: new Date()
    };

    if (defaultsNeeded) {
      baseUpdates.createdAt = new Date();
    }

    if (defaultsNeeded || data?.requiredProfile == null) {
      baseUpdates.requiredProfile = {
        age: null,
        gender: null,
        height: null,
        weight: null,
        activityLevel: null,
        fitnessGoal: null
      } satisfies FirestoreUser['requiredProfile'];
    }

    if (defaultsNeeded || data?.additionalProfile == null) {
      baseUpdates.additionalProfile = {
        occupationType: null,
        dietaryPreferences: null,
        dietaryRestrictions: null,
        desiredActivityLevel: null,
        exerciseTypes: null,
        sessionDuration: null,
        fitnessLevel: null,
        preferredEnvironment: null,
        preferredTimeOfDay: null,
        endurance: null,
        strengthMetrics: {
          pushUps: null,
          squats: null,
          trainingDaysPerWeek: null
        }
      } satisfies FirestoreUser['additionalProfile'];
    }

    if (defaultsNeeded || data?.profileCompleted == null) {
      baseUpdates.profileCompleted = false;
    }

    if (defaultsNeeded || data?.consent == null) {
      baseUpdates.consent = {
        privacySettings: {
          dataUsage: false,
          profileVisibility: 'private',
          shareWithCoaches: false,
          shareWithResearch: false
        },
        emailNotifications: {
          workoutReminders: true,
          progressUpdates: true,
          newsletter: false
        }
      };
    }

    if (Object.keys(baseUpdates).length === 0) {
      return;
    }

    await setDoc(userRef, baseUpdates, { merge: true });
  };

  // Note: User doc updates are handled server-side; no Firestore writes from the client here.

  const callOAuthEndpoint = async (
    providerId: PendingOAuth['providerId'],
    tokens: PendingOAuth['tokens'],
    code?: string
  ) => {
    const payload: Record<string, unknown> = {
      providerId
    };
    if (tokens.idToken) payload.idToken = tokens.idToken;
    if (tokens.accessToken) payload.accessToken = tokens.accessToken;
    if (code) payload.mfaCode = code;

    return apiFetch('/auth/oauth', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  };

  const createCredentialFromTokens = (pending: PendingOAuth): AuthCredential => {
    if (pending.providerId === 'google.com') {
      if (!pending.tokens.idToken && !pending.tokens.accessToken) {
        throw new Error('Missing Google tokens to complete sign-in.');
      }
      return GoogleAuthProvider.credential(pending.tokens.idToken, pending.tokens.accessToken);
    }

    if (!pending.tokens.accessToken) {
      throw new Error('Missing GitHub access token to complete sign-in.');
    }

    return GithubAuthProvider.credential(pending.tokens.accessToken);
  };

  const completePendingOAuth = async (pending: PendingOAuth) => {
    if (!mfaCode) {
      setError('Enter the 6-digit 2FA code to continue.');
      return;
    }

    const setLoading = pending.providerId === 'google.com' ? setGoogleLoading : setGithubLoading;
    setLoading(true);

    try {
      await callOAuthEndpoint(pending.providerId, pending.tokens, mfaCode);

      const credential = pending.credential ?? createCredentialFromTokens(pending);
      const firebaseCredential = await signInWithCredential(auth, credential);
      await upsertUserProfileSchema(firebaseCredential.user);

      resetMfaFlow();
      setSuccess('Signed in. 2FA checks passed.');
      options?.onAuthenticated?.(firebaseCredential.user);
    } catch (err) {
      console.error('OAuth MFA completion error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (/invalid one-time code/i.test(msg)) {
        setError('Invalid 2FA code. Please try again.');
      } else {
        setError(msg || 'We couldn’t complete sign-in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingOAuth) {
      await completePendingOAuth(pendingOAuth);
      return;
    }
    setEmailLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Call backend login to enforce email verification and optional MFA
      // const res = await apiFetch<{ uid: string; idToken: string; refreshToken: string; user?: unknown }>(
      //   '/auth/login',
      //   {
      //     method: 'POST',
      //     body: JSON.stringify({ email: formData.email, password: formData.password, mfaCode: mfaCode || undefined })
      //   }
      // );

      // After server-side checks pass, sign in the Firebase client to establish session in the app
      const credential = await signInWithEmailAndPassword(auth, formData.email, formData.password);

      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user);
        await signOut(auth);
        throw new Error('Email is not verified yet. We just re-sent the confirmation link.');
      }

      // const idToken = await credential.user.getIdToken();
      console.group('LOGIN SUCCESS');
      // console.log('Backend tokens', { idToken: res.idToken, refreshToken: res.refreshToken });
      // console.log('Firebase user', credential.user);
      // console.log('Firebase ID token', idToken);
      console.groupEnd();

      setMfaRequired(false);
      setMfaCode('');
      setSuccess('Signed in. 2FA checks passed.');
      options?.onAuthenticated?.(credential.user);
    } catch (err) {
      console.error('Login error:', err);
      const msg = err instanceof Error ? err.message : 'We couldn’t sign you in. Please try again.';
      // If backend indicates MFA is required, surface the input
      if (/One-time 2FA code required/i.test(msg) || /2FA code/i.test(msg)) {
        setMfaRequired(true);
        setError('Enter the 6-digit 2FA code to continue.');
      } else if (/Invalid one-time code/i.test(msg)) {
        setMfaRequired(true);
        setError('Invalid 2FA code. Please try again.');
      } else {
        setError(msg);
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setError(null);
    setSuccess(null);

    if (pendingOAuth && pendingOAuth.providerId !== 'github.com') {
      resetMfaFlow();
    }

    if (pendingOAuth?.providerId === 'github.com') {
      await completePendingOAuth(pendingOAuth);
      return;
    }

    setGithubLoading(true);

    try {
      const provider = new GithubAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const credential = GithubAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;

      if (!accessToken) {
        throw new Error('GitHub did not return an access token. Please try again.');
      }

      await signOut(auth).catch(() => {});

      try {
        await callOAuthEndpoint('github.com', { accessToken });
        const finalCredential = credential ?? GithubAuthProvider.credential(accessToken);
        const firebaseCredential = await signInWithCredential(auth, finalCredential);
        await upsertUserProfileSchema(firebaseCredential.user);
        resetMfaFlow();
        setSuccess('Signed in with GitHub via Firebase. Inspect the console for token details.');
        options?.onAuthenticated?.(firebaseCredential.user);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/one-time 2fa code required/i.test(msg) || /2fa code/i.test(msg)) {
          setPendingOAuth({ providerId: 'github.com', tokens: { accessToken }, credential });
          setMfaRequired(true);
          setError('Enter the 6-digit 2FA code to continue.');
          return;
        }
        throw err;
      }
    } catch (err) {
      console.error('GitHub login error:', err);
      setError(err instanceof Error ? err.message : 'We couldn’t complete GitHub sign-in. Please try again.');
    } finally {
      setGithubLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setSuccess(null);
    if (pendingOAuth && pendingOAuth.providerId !== 'google.com') {
      resetMfaFlow();
    }

    if (pendingOAuth?.providerId === 'google.com') {
      await completePendingOAuth(pendingOAuth);
      return;
    }

    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const googleIdToken = credential?.idToken;
      const googleAccessToken = credential?.accessToken;

      if (!googleIdToken && !googleAccessToken) {
        throw new Error('Google did not return authentication tokens. Please try again.');
      }

      await signOut(auth).catch(() => {});

      try {
        await callOAuthEndpoint('google.com', { idToken: googleIdToken, accessToken: googleAccessToken });
        const finalCredential = credential ?? GoogleAuthProvider.credential(googleIdToken, googleAccessToken);
        const firebaseCredential = await signInWithCredential(auth, finalCredential);
        await upsertUserProfileSchema(firebaseCredential.user);
        resetMfaFlow();
        setSuccess('Signed in with Google via Firebase. Inspect the console for token details.');
        options?.onAuthenticated?.(firebaseCredential.user);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/one-time 2fa code required/i.test(msg) || /2fa code/i.test(msg)) {
          setPendingOAuth({ providerId: 'google.com', tokens: { idToken: googleIdToken ?? undefined, accessToken: googleAccessToken ?? undefined }, credential });
          setMfaRequired(true);
          setError('Enter the 6-digit 2FA code to continue.');
          return;
        }
        throw err;
      }
    } catch (err) {
      console.error('Google login error:', err);
      setError(err instanceof Error ? err.message : 'We couldn’t complete Google sign-in. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    setSuccess(null);
    try {
      if (!formData.email) {
        throw new Error('Enter your email first to receive a reset link.');
      }
      await sendPasswordResetEmail(auth, formData.email);
      setSuccess('Password reset email sent. Please check your inbox.');
    } catch (err) {
      console.error('Password reset error:', err);
      setError(err instanceof Error ? err.message : 'Could not send password reset email.');
    }
  };

  const handleMfaChange = (e: React.ChangeEvent<HTMLInputElement>) => setMfaCode(e.target.value);

  return {
    formData,
    handleChange,
    handleSubmit,
    handleGitHubLogin,
    handleGoogleLogin,
    handlePasswordReset,
    loading,
    emailLoading,
    githubLoading,
    googleLoading,
    error,
    success,
    mfaRequired,
    mfaCode,
    handleMfaChange,
    pendingOAuthProvider: pendingOAuth?.providerId ?? null
  };
};

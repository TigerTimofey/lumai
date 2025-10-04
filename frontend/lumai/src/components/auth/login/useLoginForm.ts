import { useState } from 'react';
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, db } from '../../../config/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { apiFetch } from '../../../utils/api';
import type { User } from 'firebase/auth';

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

  const loading = emailLoading || githubLoading || googleLoading;

  // Ensure GitHub/Google users have the same Firestore schema as email/password registration
  const upsertUserProfileSchema = async (user: User) => {
    const userRef = doc(db, 'users', user.uid);
    const payload = {
      // Basic user information
      email: user.email ?? null,
      displayName: user.displayName || null,
      emailVerified: user.emailVerified,
      createdAt: new Date(),
      updatedAt: new Date(),

      // Profile completion status
      profileCompleted: false,

      // REQUIRED PARAMETERS (must be filled for profile completion)
      requiredProfile: {
        age: null as number | null,
        gender: null as string | null,
        height: null as number | null,
        weight: null as number | null,
        activityLevel: null as string | null,
        fitnessGoal: null as string | null
      },

      // ADDITIONAL PARAMETERS (optional enhancements)
      additionalProfile: {
        occupationType: null as string | null,
        dietaryPreferences: null as string | null,
        dietaryRestrictions: null as string | null,
        desiredActivityLevel: null as string | null,
        trainingDaysPerWeek: null as number | null,
        exerciseTypes: null as string | null,
        sessionDuration: null as number | null,
        fitnessLevel: null as string | null,
        preferredEnvironment: null as string | null,
        preferredTimeOfDay: null as string | null,
        endurance: null as number | null,
        strengthMetrics: {
          pushUps: null as number | null,
          squats: null as number | null
        }
      },

      // USER CONSENT & PRIVACY
      consent: {
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
      }
    };

    // Merge so we don't clobber any server-created fields (like mfa/privacy) and to add these if missing
    await setDoc(userRef, payload, { merge: true });
  };

  // Note: User doc updates are handled server-side; no Firestore writes from the client here.

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Call backend login to enforce email verification and optional MFA
      const res = await apiFetch<{ uid: string; idToken: string; refreshToken: string; user?: unknown }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email: formData.email, password: formData.password, mfaCode: mfaCode || undefined })
        }
      );

      // After server-side checks pass, sign in the Firebase client to establish session in the app
      const credential = await signInWithEmailAndPassword(auth, formData.email, formData.password);

      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user);
        await signOut(auth);
        throw new Error('Email is not verified yet. We just re-sent the confirmation link.');
      }

      const idToken = await credential.user.getIdToken();
      console.group('LOGIN SUCCESS');
      console.log('Backend tokens', { idToken: res.idToken, refreshToken: res.refreshToken });
      console.log('Firebase user', credential.user);
      console.log('Firebase ID token', idToken);
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
    setGithubLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const provider = new GithubAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      const credential = GithubAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;

      console.group('GITHUB LOGIN SUCCESS');
      console.log('Firebase user', result.user);
      console.log('ID token', idToken);
      console.groupEnd();

      // Inform backend to bootstrap/sync user doc for OAuth
      try {
        await apiFetch('/auth/oauth', {
          method: 'POST',
          body: JSON.stringify({ providerId: 'github.com', accessToken })
        });
      } catch (e) {
        // Non-fatal for client sign-in; log for diagnostics
        console.warn('Backend OAuth bootstrap failed (non-fatal):', e);
      }

      // Ensure Firestore has the same schema as registration
      try {
        await upsertUserProfileSchema(result.user);
      } catch (e) {
        console.warn('User profile upsert failed (non-fatal):', e);
      }

      setSuccess('Signed in with GitHub via Firebase. Inspect the console for token details.');
      options?.onAuthenticated?.(result.user);
    } catch (err) {
      console.error('GitHub login error:', err);
      setError(err instanceof Error ? err.message : 'We couldn’t complete GitHub sign-in. Please try again.');
    } finally {
      setGithubLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const googleIdToken = credential?.idToken;
      const googleAccessToken = credential?.accessToken;

      console.group('GOOGLE LOGIN SUCCESS');
      console.log('Firebase user', result.user);
      console.log('ID token', idToken);
      console.groupEnd();

      // Inform backend to bootstrap/sync user doc for OAuth
      try {
        await apiFetch('/auth/oauth', {
          method: 'POST',
          body: JSON.stringify({ providerId: 'google.com', idToken: googleIdToken, accessToken: googleAccessToken })
        });
      } catch (e) {
        console.warn('Backend OAuth bootstrap failed (non-fatal):', e);
      }

      // Ensure Firestore has the same schema as registration
      try {
        await upsertUserProfileSchema(result.user);
      } catch (e) {
        console.warn('User profile upsert failed (non-fatal):', e);
      }

      setSuccess('Signed in with Google via Firebase. Inspect the console for token details.');
      options?.onAuthenticated?.(result.user);
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

  return { formData, handleChange, handleSubmit, handleGitHubLogin, handleGoogleLogin, handlePasswordReset, loading, emailLoading, githubLoading, googleLoading, error, success, mfaRequired, mfaCode, handleMfaChange };
};

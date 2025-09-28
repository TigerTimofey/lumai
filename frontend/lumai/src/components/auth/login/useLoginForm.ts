import { useState } from 'react';
import {
  GithubAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendEmailVerification
} from 'firebase/auth';
import { auth } from '../../../config/firebase';
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
  loading: boolean;
  emailLoading: boolean;
  githubLoading: boolean;
  error: string | null;
  success: string | null;
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

  const loading = emailLoading || githubLoading;

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
      const credential = await signInWithEmailAndPassword(auth, formData.email, formData.password);

      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user);
        await signOut(auth);
        throw new Error('Email is not verified yet. We just re-sent the confirmation link.');
      }

      const idToken = await credential.user.getIdToken();

      console.group('CLIENT LOGIN SUCCESS');
      console.log('User', credential.user);
      console.log('ID token', idToken);
      console.log('Refresh token', credential.user.refreshToken);
      console.groupEnd();

      setSuccess('Signed in via Firebase. Inspect the browser console for token details.');
      options?.onAuthenticated?.(credential.user);
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'We couldn’t sign you in. Please try again.');
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

      console.group('GITHUB LOGIN SUCCESS');
      console.log('Firebase user', result.user);
      console.log('ID token', idToken);
      console.groupEnd();

      setSuccess('Signed in with GitHub via Firebase. Inspect the console for token details.');
      options?.onAuthenticated?.(result.user);
    } catch (err) {
      console.error('GitHub login error:', err);
      setError(err instanceof Error ? err.message : 'We couldn’t complete GitHub sign-in. Please try again.');
    } finally {
      setGithubLoading(false);
    }
  };

  return { formData, handleChange, handleSubmit, handleGitHubLogin, loading, emailLoading, githubLoading, error, success };
};

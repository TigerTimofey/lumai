import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile,
  GithubAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth } from '../../../config/firebase';

interface RegisterFormData {
  email: string;
  password: string;
  displayName?: string;
}

interface UseRegisterFormReturn {
  formData: RegisterFormData;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleGitHubLogin: () => Promise<void>;
  loading: boolean;
  error: string | null;
  success: string | null;
}

export const useRegisterForm = (): UseRegisterFormReturn => {
  const [formData, setFormData] = useState<RegisterFormData>({
    email: '',
    password: '',
    displayName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const credential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);

      if (formData.displayName) {
        await updateProfile(credential.user, { displayName: formData.displayName });
      }

      await sendEmailVerification(credential.user);

      const idToken = await credential.user.getIdToken();

      console.group('CLIENT REGISTER SUCCESS');
      console.log('User', credential.user);
      console.log('ID token', idToken);
      console.log('Refresh token', credential.user.refreshToken);
      console.log('Email verification sent to', credential.user.email);
      console.groupEnd();

      setSuccess('Check your inbox and confirm the email address before signing in. See console for token details.');
      setFormData({ email: '', password: '', displayName: '' });

      await signOut(auth);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'We couldn’t create the account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setLoading(true);
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

      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      if (backendUrl) {
        try {
          const response = await fetch(`${backendUrl}/api/auth/oauth`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              providerId: 'github.com',
              idToken,
            }),
          });

          if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.message ?? 'Backend OAuth exchange failed');
          }

          const data = await response.json();
          console.group('BACKEND OAUTH EXCHANGE');
          console.log('Payload', data);
          console.groupEnd();

          setSuccess('Signed in with GitHub. Tokens are available in the console.');
          return;
        } catch (backendError) {
          console.warn('Backend OAuth exchange unsuccessful:', backendError);
          setSuccess(
            'Signed in with GitHub via Firebase. Backend exchange unavailable; tokens logged in console.'
          );
          return;
        }
      }

      setSuccess('Signed in with GitHub via Firebase. Backend URL not configured; see console for tokens.');
    } catch (err) {
      console.error('GitHub login error:', err);
      setError(err instanceof Error ? err.message : 'We couldn’t complete GitHub sign-in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return { formData, handleChange, handleSubmit, handleGitHubLogin, loading, error, success };
};

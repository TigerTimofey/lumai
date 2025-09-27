import { useState } from 'react';
import { signInWithPopup, GithubAuthProvider } from 'firebase/auth';
import { auth } from '../config/firebase';

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
  error: string | null;
}

export const useLoginForm = (): UseLoginFormReturn => {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      console.log('Login successful:', data);
      // TODO: Handle success, e.g., store token, redirect
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setLoading(true);
    setError(null);

    const provider = new GithubAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();
      console.log('GitHub login successful:', result.user);

      // Send to backend
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/oauth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerId: 'github.com',
          idToken,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'OAuth login failed');
      }

      console.log('Backend response:', data);
      // TODO: Handle success
    } catch (err) {
      console.error('GitHub login error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return { formData, handleChange, handleSubmit, handleGitHubLogin, loading, error };
};
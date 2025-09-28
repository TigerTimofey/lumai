import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile,
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
  loading: boolean;
  emailLoading: boolean;
  error: string | null;
  success: string | null;
}

export const useRegisterForm = (): UseRegisterFormReturn => {
  const [formData, setFormData] = useState<RegisterFormData>({
    email: '',
    password: '',
    displayName: '',
  });
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loading = emailLoading;

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

      setSuccess('Please check your email and confirm your email address.');
      setFormData({ email: '', password: '', displayName: '' });

      await signOut(auth);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'We couldn’t create the account. Please try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  return { formData, handleChange, handleSubmit, loading, emailLoading, error, success };
};

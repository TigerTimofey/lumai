import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth } from '../../../config/firebase';
import { db } from '../../../config/firebase';

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

      // Create initial user data in Firestore
      await setDoc(doc(db, 'users', credential.user.uid), {
        // Basic user information
        email: credential.user.email,
        displayName: formData.displayName || null,
        emailVerified: credential.user.emailVerified,
        createdAt: new Date(),
        updatedAt: new Date(),
        
        // Profile completion status
        profileCompleted: false,
        
        // REQUIRED PARAMETERS (must be filled for profile completion)
        requiredProfile: {
          age: null,
          gender: null,
          height: null,
          weight: null,
          activityLevel: null,
          fitnessGoal: null
        },
        
        // ADDITIONAL PARAMETERS (optional enhancements)
        additionalProfile: {
          occupationType: null,
          dietaryPreferences: null,
          dietaryRestrictions: null,
          desiredActivityLevel: null,
          trainingDaysPerWeek: null,
          exerciseTypes: null,
          sessionDuration: null,
          fitnessLevel: null,
          preferredEnvironment: null,
          preferredTimeOfDay: null,
          endurance: null,
          strengthMetrics: {
            pushUps: null,
            squats: null
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
      });

      await sendEmailVerification(credential.user);

      console.group('USER REGISTERED WITH INITIAL DATA');
      console.log('User ID:', credential.user.uid);
      console.log('Email:', credential.user.email);
      console.log('Display Name:', formData.displayName);
      console.groupEnd();

      setSuccess('Account created successfully! Please check your email to verify your account.');
      setFormData({ email: '', password: '', displayName: '' });

      await signOut(auth);
    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'We couldn\'t create the account. Please try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  return { formData, handleChange, handleSubmit, loading, emailLoading, error, success };
};

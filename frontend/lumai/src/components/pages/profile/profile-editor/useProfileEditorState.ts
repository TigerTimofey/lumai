import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../../../../config/firebase';
import type { AdditionalProfile, FirestoreUser, RequiredProfile } from '../profileOptions/types';
import { apiFetch } from '../../../../utils/api';

interface UseProfileEditorStateParams {
  uid: string;
}

interface ProfileEditorState {
  loading: boolean;
  error: string | null;
  savedAt: number | null;
  required: RequiredProfile;
  bonus: AdditionalProfile;
  canSaveRequired: boolean;
  onChangeRequired: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onChangeBonus: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  save: () => Promise<void>;
}

const emptyRequired: RequiredProfile = {
  activityLevel: null,
  age: null,
  fitnessGoal: null,
  gender: null,
  height: null,
  weight: null
};

const emptyBonus: AdditionalProfile = {
  desiredActivityLevel: null,
  dietaryPreferences: null,
  dietaryRestrictions: null,
  endurance: null,
  exerciseTypes: null,
  fitnessLevel: null,
  occupationType: null,
  preferredEnvironment: null,
  preferredTimeOfDay: null,
  sessionDuration: null,
  strengthMetrics: {
    pushUps: null,
    squats: null,
    trainingDaysPerWeek: null
  }
};

export const useProfileEditorState = ({ uid }: UseProfileEditorStateParams): ProfileEditorState => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [required, setRequired] = useState<RequiredProfile>(emptyRequired);
  const [bonus, setBonus] = useState<AdditionalProfile>(emptyBonus);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!active) {
          return;
        }

        if (snap.exists()) {
          const data = snap.data() as FirestoreUser;
          const r = (data?.requiredProfile ?? {}) as Partial<RequiredProfile>;
          const a = (data?.additionalProfile ?? {}) as Partial<AdditionalProfile>;

          setRequired((prev) => ({
            activityLevel: r.activityLevel ?? prev.activityLevel,
            age: r.age != null ? Number(r.age) : prev.age,
            fitnessGoal: r.fitnessGoal ?? prev.fitnessGoal,
            gender: r.gender ?? prev.gender,
            height: r.height != null ? Number(r.height) : prev.height,
            weight: r.weight != null ? Number(r.weight) : prev.weight
          }));

          setBonus((prev) => ({
            desiredActivityLevel: a.desiredActivityLevel ?? prev.desiredActivityLevel,
            dietaryPreferences: a.dietaryPreferences ?? prev.dietaryPreferences,
            dietaryRestrictions: a.dietaryRestrictions ?? prev.dietaryRestrictions,
            endurance: a.endurance != null ? Number(a.endurance) : prev.endurance,
            exerciseTypes: a.exerciseTypes ?? prev.exerciseTypes,
            fitnessLevel: a.fitnessLevel ?? prev.fitnessLevel,
            occupationType: a.occupationType ?? prev.occupationType,
            preferredEnvironment: a.preferredEnvironment ?? prev.preferredEnvironment,
            preferredTimeOfDay: a.preferredTimeOfDay ?? prev.preferredTimeOfDay,
            sessionDuration: a.sessionDuration ?? prev.sessionDuration,
            strengthMetrics: {
              pushUps: a?.strengthMetrics?.pushUps != null ? Number(a.strengthMetrics.pushUps) : prev.strengthMetrics.pushUps,
              squats: a?.strengthMetrics?.squats != null ? Number(a.strengthMetrics.squats) : prev.strengthMetrics.squats,
              trainingDaysPerWeek: a?.strengthMetrics?.trainingDaysPerWeek != null
                ? Number(a.strengthMetrics.trainingDaysPerWeek)
                : prev.strengthMetrics.trainingDaysPerWeek
            }
          }));
        }
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [uid]);

  const canSaveRequired = useMemo(
    () => Boolean(
      required.activityLevel &&
      required.age != null &&
      required.fitnessGoal &&
      required.gender &&
      required.height != null &&
      required.weight != null
    ),
    [required]
  );

  const onChangeRequired = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setRequired((prev) => ({
      ...prev,
      [name]: ['age', 'height', 'weight'].includes(name)
        ? value === ''
          ? null
          : Number(value)
        : value || null
    }));
  }, []);

  const onChangeBonus = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;

    if (name.startsWith('strength.')) {
      const key = name.split('.')[1] as 'pushUps' | 'squats' | 'trainingDaysPerWeek';
      setBonus((prev) => ({
        ...prev,
        strengthMetrics: {
          ...prev.strengthMetrics,
          [key]: value === '' ? null : Number(value)
        }
      }));
      return;
    }

    setBonus((prev) => ({
      ...prev,
      [name]: ['endurance'].includes(name)
        ? value === ''
          ? null
          : Number(value)
        : value || null
    }) as AdditionalProfile);
  }, []);

  const save = useCallback(async () => {
    setError(null);
    try {
      await setDoc(
        doc(db, 'users', uid),
        {
          requiredProfile: required,
          additionalProfile: bonus,
          profileCompleted: canSaveRequired,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      try {
        await apiFetch('/analytics/process', { method: 'POST' });
      } catch (processError) {
        console.warn('Failed to refresh processed metrics', processError);
      }
      setSavedAt(Date.now());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }, [uid, required, bonus, canSaveRequired]);

  return {
    loading,
    error,
    savedAt,
    required,
    bonus,
    canSaveRequired,
    onChangeRequired,
    onChangeBonus,
    save
  };
};

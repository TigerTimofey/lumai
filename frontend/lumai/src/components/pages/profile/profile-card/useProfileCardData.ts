import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../../../../config/firebase';
import type {
  AdditionalProfile,
  FirestoreUser,
  ProfileSummary,
  RequiredProfile
} from '../profileOptions/types';
import type {
  ProfileCardData,
  ProfileCardHeaderField,
  ProfileCardRowData,
  ProfileCardSectionData
} from './types';

interface ProfileCardUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean | null;
}

interface UseProfileCardDataParams {
  user: ProfileCardUser;
  profile: ProfileSummary | null;
  loading: boolean;
  error: string | null;
  createdAtText: string;
}

const hasValue = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((entry) => hasValue(entry));
  }
  return true;
};

const formatNumber = (value: number | string | null | undefined, suffix?: string): string => {
  if (value === null || value === undefined) {
    return '—';
  }

  const numeric = typeof value === 'string' ? Number(value) : value;
  if (Number.isFinite(numeric)) {
    return suffix ? `${numeric}${suffix}` : `${numeric}`;
  }

  return String(value);
};

const formatList = (value: unknown): string => {
  if (!hasValue(value)) {
    return '—';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return String(value);
};

const formatStrengthMetrics = (metrics: AdditionalProfile['strengthMetrics'] | null | undefined) => {
  if (!hasValue(metrics)) {
    return '—';
  }

  return `Push-ups: ${formatNumber(metrics?.pushUps)}, Squats: ${formatNumber(metrics?.squats)}, Training days/week: ${formatNumber(metrics?.trainingDaysPerWeek)}`;
};

const mergeRequiredProfile = (
  firestoreRequired?: Partial<RequiredProfile> | null,
  apiRequired?: Partial<RequiredProfile> | null
): Partial<RequiredProfile> => ({
  activityLevel: firestoreRequired?.activityLevel ?? apiRequired?.activityLevel ?? null,
  age: firestoreRequired?.age ?? apiRequired?.age ?? null,
  fitnessGoal: firestoreRequired?.fitnessGoal ?? apiRequired?.fitnessGoal ?? null,
  gender: firestoreRequired?.gender ?? apiRequired?.gender ?? null,
  height: firestoreRequired?.height ?? apiRequired?.height ?? null,
  weight: firestoreRequired?.weight ?? apiRequired?.weight ?? null
});

const mergeAdditionalProfile = (
  firestoreAdditional?: Partial<AdditionalProfile> | null,
  apiAdditional?: Partial<AdditionalProfile> | null
): Partial<AdditionalProfile> => ({
  desiredActivityLevel: firestoreAdditional?.desiredActivityLevel ?? apiAdditional?.desiredActivityLevel ?? null,
  dietaryPreferences: firestoreAdditional?.dietaryPreferences ?? apiAdditional?.dietaryPreferences ?? null,
  dietaryRestrictions: firestoreAdditional?.dietaryRestrictions ?? apiAdditional?.dietaryRestrictions ?? null,
  endurance: firestoreAdditional?.endurance ?? apiAdditional?.endurance ?? null,
  exerciseTypes: firestoreAdditional?.exerciseTypes ?? apiAdditional?.exerciseTypes ?? null,
  fitnessLevel: firestoreAdditional?.fitnessLevel ?? apiAdditional?.fitnessLevel ?? null,
  occupationType: firestoreAdditional?.occupationType ?? apiAdditional?.occupationType ?? null,
  preferredEnvironment: firestoreAdditional?.preferredEnvironment ?? apiAdditional?.preferredEnvironment ?? null,
  preferredTimeOfDay: firestoreAdditional?.preferredTimeOfDay ?? apiAdditional?.preferredTimeOfDay ?? null,
  sessionDuration: firestoreAdditional?.sessionDuration ?? apiAdditional?.sessionDuration ?? null,
  strengthMetrics: firestoreAdditional?.strengthMetrics ?? apiAdditional?.strengthMetrics ?? undefined
});

const buildHeaderFields = (
  createdAtText: string,
  profile: ProfileSummary | null,
  user: ProfileCardUser
): ProfileCardHeaderField[] => {
  const verifiedFlag = profile?.emailVerified ?? user.emailVerified;
  const emailVerified = verifiedFlag === null || verifiedFlag === undefined
    ? 'No'
    : verifiedFlag
      ? 'Yes'
      : 'No';

  return [
    { label: 'Created', value: createdAtText },
    { label: 'Name', value: profile?.displayName ?? user.displayName ?? '—' },
    { label: 'Email', value: profile?.email ?? user.email ?? '—' },
    { label: 'Email verified', value: emailVerified }
  ];
};

const buildRequiredRows = (required: Partial<RequiredProfile>): ProfileCardRowData[] => [
  {
    label: 'Activity level',
    value: required.activityLevel ?? '—',
    completed: hasValue(required.activityLevel)
  },
  {
    label: 'Age',
    value: formatNumber(required.age),
    completed: hasValue(required.age)
  },
  {
    label: 'Fitness goal',
    value: required.fitnessGoal ?? '—',
    completed: hasValue(required.fitnessGoal)
  },
  {
    label: 'Gender',
    value: required.gender ?? '—',
    completed: hasValue(required.gender)
  },
  {
    label: 'Height',
    value: formatNumber(required.height, ' cm'),
    completed: hasValue(required.height)
  },
  {
    label: 'Weight',
    value: formatNumber(required.weight, ' kg'),
    completed: hasValue(required.weight)
  }
];

const buildBonusRows = (additional: Partial<AdditionalProfile>): ProfileCardRowData[] => {
  const strength = additional.strengthMetrics ?? null;

  return [
    {
      label: 'Desired activity level',
      value: additional.desiredActivityLevel ?? '—',
      completed: hasValue(additional.desiredActivityLevel)
    },
    {
      label: 'Dietary preferences',
      value: formatList(additional.dietaryPreferences),
      completed: hasValue(additional.dietaryPreferences)
    },
    {
      label: 'Dietary restrictions',
      value: formatList(additional.dietaryRestrictions),
      completed: hasValue(additional.dietaryRestrictions)
    },
    {
      label: 'Endurance (minutes)',
      value: formatNumber(additional.endurance),
      completed: hasValue(additional.endurance)
    },
    {
      label: 'Exercise types',
      value: formatList(additional.exerciseTypes),
      completed: hasValue(additional.exerciseTypes)
    },
    {
      label: 'Fitness level',
      value: additional.fitnessLevel ?? '—',
      completed: hasValue(additional.fitnessLevel)
    },
    {
      label: 'Occupation type',
      value: additional.occupationType ?? '—',
      completed: hasValue(additional.occupationType)
    },
    {
      label: 'Preferred environment',
      value: additional.preferredEnvironment ?? '—',
      completed: hasValue(additional.preferredEnvironment)
    },
    {
      label: 'Preferred time of day',
      value: additional.preferredTimeOfDay ?? '—',
      completed: hasValue(additional.preferredTimeOfDay)
    },
    {
      label: 'Session duration',
      value: additional.sessionDuration ?? '—',
      completed: hasValue(additional.sessionDuration)
    },
    {
      label: 'Strength metrics',
      value: formatStrengthMetrics(strength),
      completed: hasValue(strength)
    }
  ];
};

export const useProfileCardData = ({
  user,
  profile,
  loading,
  error,
  createdAtText
}: UseProfileCardDataParams): ProfileCardData => {
  const [firestoreProfile, setFirestoreProfile] = useState<FirestoreUser | null>(null);
  const [firestoreLoading, setFirestoreLoading] = useState(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!user.uid) {
      setFirestoreProfile(null);
      setFirestoreLoading(false);
      setFirestoreError('User ID missing');
      return () => {};
    }

    setFirestoreLoading(true);
    setFirestoreError(null);

    const profileRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setFirestoreProfile(snapshot.data() as FirestoreUser);
        } else {
          setFirestoreProfile(null);
        }
        setFirestoreLoading(false);
      },
      (err) => {
        setFirestoreError(err.message ?? String(err));
        setFirestoreLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user.uid]);

  const combinedError = error ?? firestoreError;
  const combinedLoading = loading || firestoreLoading;

  const mergedRequired = useMemo(
    () => mergeRequiredProfile(firestoreProfile?.requiredProfile, profile?.requiredProfile ?? null),
    [firestoreProfile?.requiredProfile, profile?.requiredProfile]
  );

  const mergedAdditional = useMemo(
    () => mergeAdditionalProfile(firestoreProfile?.additionalProfile, profile?.additionalProfile ?? null),
    [firestoreProfile?.additionalProfile, profile?.additionalProfile]
  );

  const headerFields = useMemo(
    () => buildHeaderFields(createdAtText, profile, user),
    [createdAtText, profile, user]
  );

  const requiredSection: ProfileCardSectionData = useMemo(
    () => ({
      title: 'Required profile',
      rows: buildRequiredRows(mergedRequired)
    }),
    [mergedRequired]
  );

  const bonusSection: ProfileCardSectionData = useMemo(
    () => ({
      title: 'Extra data',
      rows: buildBonusRows(mergedAdditional)
    }),
    [mergedAdditional]
  );

  return {
    loading: combinedLoading,
    error: combinedError,
    headerFields,
    sections: {
      required: requiredSection,
      bonus: bonusSection
    }
  };
};

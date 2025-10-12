import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../../../../config/firebase';
import type { AdditionalProfile, FirestoreUser, RequiredProfile } from '../../profile/profileOptions/types';

interface ProfileCompletionWidgetProps {
  uid: string;
}

const REQUIRED_FIELDS: Array<keyof RequiredProfile> = [
  'activityLevel',
  'age',
  'fitnessGoal',
  'gender',
  'height',
  'weight'
];

const EXTRA_FIELDS: Array<keyof AdditionalProfile> = [
  'desiredActivityLevel',
  'dietaryPreferences',
  'dietaryRestrictions',
  'endurance',
  'exerciseTypes',
  'fitnessLevel',
  'occupationType',
  'preferredEnvironment',
  'preferredTimeOfDay',
  'sessionDuration'
];

const STRENGTH_METRIC_FIELDS: Array<keyof NonNullable<AdditionalProfile['strengthMetrics']>> = [
  'pushUps',
  'squats',
  'trainingDaysPerWeek'
];

const TOTAL_REQUIRED = REQUIRED_FIELDS.length;
const TOTAL_EXTRA = EXTRA_FIELDS.length + STRENGTH_METRIC_FIELDS.length;
const TOTAL_FIELDS = TOTAL_REQUIRED + TOTAL_EXTRA;

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

const countProvidedFields = (profile: FirestoreUser | null) => {
  const requiredProfile = profile?.requiredProfile ?? null;
  const additionalProfile = profile?.additionalProfile ?? null;

  const requiredProvided = REQUIRED_FIELDS.reduce((count, field) => (
    hasValue((requiredProfile ?? {})[field] ?? null) ? count + 1 : count
  ), 0);

  const extraProvidedCore = EXTRA_FIELDS.reduce((count, field) => (
    hasValue((additionalProfile ?? {})[field] ?? null) ? count + 1 : count
  ), 0);

  const strengthMetrics = additionalProfile?.strengthMetrics ?? null;
  const extraProvidedStrength = STRENGTH_METRIC_FIELDS.reduce((count, field) => (
    hasValue(strengthMetrics?.[field] ?? null) ? count + 1 : count
  ), 0);

  return {
    requiredProvided,
    extraProvided: extraProvidedCore + extraProvidedStrength
  };
};

const ProfileCompletionWidget: React.FC<ProfileCompletionWidgetProps> = ({ uid }) => {
  const [profile, setProfile] = useState<FirestoreUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getDoc(doc(db, 'users', uid))
      .then((snapshot) => {
        if (!active) return;
        if (snapshot.exists()) {
          setProfile(snapshot.data() as FirestoreUser);
        } else {
          setProfile(null);
        }
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [uid]);

  const { requiredProvided, extraProvided } = useMemo(
    () => countProvidedFields(profile),
    [profile]
  );

  const totalProvided = requiredProvided + extraProvided;
  const progress = Math.round((totalProvided / TOTAL_FIELDS) * 100);
  const allComplete = totalProvided >= TOTAL_FIELDS;

  if (!loading && !error && allComplete) {
    return null;
  }

  const bannerClassNames = [
    'profile-completion-banner',
    loading ? 'profile-completion-banner--loading' : '',
    error ? 'profile-completion-banner--error' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={bannerClassNames} aria-live="polite">
      <div className="profile-completion-main">
        {loading ? (
          <>
            <p className="profile-completion-title">Checking your profile…</p>
            <p className="profile-completion-subtitle">We’re loading your completion progress.</p>
          </>
        ) : error ? (
          <p className="profile-completion-message" role="alert">{error}</p>
        ) : (
          <>
            <p className="profile-completion-title">Complete profile</p>
            <p className="profile-completion-subtitle"> {progress}% complete</p>
          </>
        )}
      </div>
      {!loading && !error && (
        <>
          <div className="profile-completion-meta">
            <span className="profile-completion-chip">{requiredProvided}/{TOTAL_REQUIRED} required</span>
            <span className="profile-completion-chip">{extraProvided}/{TOTAL_EXTRA} extra</span>
          </div>
          {!allComplete && (
            <a href="/profile" className="profile-completion-link">
              Finish now →
            </a>
          )}
        </>
      )}
      {error && (
        <p className="profile-completion-message">Try again later or update your profile manually.</p>
      )}
    </div>
  );
};

export default ProfileCompletionWidget;

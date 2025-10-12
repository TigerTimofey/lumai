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

  return (
    <div className="dashboard-widget profile-completion-widget" aria-live="polite">
      <h3 className="dashboard-widget-title">Profile completeness</h3>
      <div className="dashboard-widget-body">
        {loading ? (
          <p>Checking your profile…</p>
        ) : error ? (
          <p role="alert" className="profile-completion-error">{error}</p>
        ) : (
          <>
            <div className="profile-completion-summary">
              <span className="profile-completion-ratio">{totalProvided}/{TOTAL_FIELDS}</span>
              <span className="profile-completion-progress-text">{progress}% complete</span>
            </div>
            <div className="profile-completion-progress" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL_FIELDS} aria-valuenow={totalProvided}>
              <div className="profile-completion-progress-bar" style={{ width: `${progress}%` }} />
            </div>
            <ul className="profile-completion-breakdown">
              <li><strong>Required</strong> {requiredProvided}/{TOTAL_REQUIRED}</li>
              <li><strong>Extra</strong> {extraProvided}/{TOTAL_EXTRA}</li>
            </ul>
            {!allComplete && (
              <a href="/profile" className="dashboard-hero-action profile-completion-action">
                Complete profile
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProfileCompletionWidget;

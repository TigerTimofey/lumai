import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../../../../config/firebase';
import type { AdditionalProfile, FirestoreUser, RequiredProfile } from '../../profile/profileOptions/types';

interface ProfileAnalyticsWidgetProps {
  uid: string;
}

const ACTIVITY_SCORES: Record<string, number> = {
  sedentary: 25,
  light: 45,
  lightly_active: 55,
  moderate: 70,
  very_active: 85,
  extra_active: 95
};

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: 'Sedentary',
  light: 'Light',
  lightly_active: 'Lightly Active',
  moderate: 'Moderate',
  very_active: 'Very Active',
  extra_active: 'Extra Active'
};

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(numeric) ? Number(numeric) : null;
};

const bmiClassification = (bmi: number | null) => {
  if (bmi == null) return '—';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal range';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
};

const scoreFromBmi = (bmi: number | null) => {
  if (bmi == null) return 50;
  // Penalise distance from midpoint 22
  const diff = Math.abs(bmi - 22);
  const penalty = Math.min(diff * 8, 70);
  return Math.max(100 - penalty, 20);
};

const scoreFromActivity = (activity?: string | null) => {
  if (!activity) {
    return 40;
  }
  return ACTIVITY_SCORES[activity] ?? 60;
};

const scoreFromProgress = (trainingDays: number | null, targetDays: number | null) => {
  if (trainingDays == null) {
    return 40;
  }
  const goal = targetDays ?? 5;
  const ratio = Math.min(trainingDays / goal, 1);
  return Math.round(50 + ratio * 50);
};

const scoreFromHabits = (dietaryPreferences: unknown, sessionDuration: unknown) => {
  let score = 55;

  if (typeof dietaryPreferences === 'string' && dietaryPreferences.trim().length > 0) {
    score += 8;
  }

  if (typeof sessionDuration === 'string') {
    if (sessionDuration === '60+' || sessionDuration === '60-90') {
      score += 12;
    } else if (sessionDuration === '30-60') {
      score += 6;
    }
  }

  return Math.max(30, Math.min(score, 100));
};

const ProfileAnalyticsWidget: React.FC<ProfileAnalyticsWidgetProps> = ({ uid }) => {
  const [profile, setProfile] = useState<FirestoreUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!active) return;
        setProfile(snap.exists() ? (snap.data() as FirestoreUser) : null);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [uid]);

  const metrics = useMemo(() => {
    const required = (profile?.requiredProfile ?? {}) as Partial<RequiredProfile>;
    const extra = (profile?.additionalProfile ?? {}) as Partial<AdditionalProfile>;
    const strength = (extra.strengthMetrics ?? {}) as Partial<AdditionalProfile['strengthMetrics']>;

    const weight = parseNumber(required.weight);
    const height = parseNumber(required.height);
    const bmi = weight != null && height != null && height > 0 ? weight / Math.pow(height / 100, 2) : null;

    const bmiScore = scoreFromBmi(bmi);
    const rawActivity = required.activityLevel ?? extra.desiredActivityLevel ?? null;
    const activityScore = scoreFromActivity(rawActivity);
    const progressScore = scoreFromProgress(parseNumber(strength.trainingDaysPerWeek ?? null), 5);
    const habitsScore = scoreFromHabits(extra.dietaryPreferences, extra.sessionDuration);

    const wellnessScore = Math.round(
      bmiScore * 0.3 +
        activityScore * 0.3 +
        progressScore * 0.2 +
        habitsScore * 0.2
    );

    return {
      weight,
      height,
      bmi,
      bmiLabel: bmiClassification(bmi),
      wellnessScore,
      trainingDays: parseNumber(strength.trainingDaysPerWeek ?? null),
      activityLabel: rawActivity
        ? (ACTIVITY_LABELS[rawActivity] ??
          rawActivity
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase()))
        : '—'
    };
  }, [profile]);

  return (
    <section className="dashboard-widget" aria-labelledby="profile-analytics-title">
      <h3 id="profile-analytics-title" className="dashboard-widget-title">Health analytics</h3>
      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 12 }}>
        {loading ? (
          <p>Calculating metrics…</p>
        ) : error ? (
          <p role="alert" style={{ color: 'var(--color-error)', margin: 0 }}>{error}</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <strong>BMI</strong>
                <div style={{ fontSize: '1.4rem', color: 'var(--color-gray-900)' }}>
                  {metrics.bmi != null ? metrics.bmi.toFixed(1) : '—'}
                </div>
              </div>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-gray-500)' }}>{metrics.bmiLabel}</span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <strong>Wellness score</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: '1 1 auto', height: 8, borderRadius: 999, background: 'var(--color-gray-200)', overflow: 'hidden' }}>
                  <div style={{ width: `${metrics.wellnessScore}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.2s ease' }} />
                </div>
                <span style={{ fontWeight: 600 }}>{metrics.wellnessScore}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <strong>Activity level</strong>
              <span>{metrics.activityLabel}</span>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <strong>Training days / week</strong>
              <span>{metrics.trainingDays != null ? metrics.trainingDays : '—'}</span>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <strong>Current weight</strong>
              <span>{metrics.weight != null ? `${metrics.weight} kg` : '—'}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default ProfileAnalyticsWidget;

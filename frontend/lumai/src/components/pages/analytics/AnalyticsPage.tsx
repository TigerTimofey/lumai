import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Line, Bar, Radar, Doughnut } from 'react-chartjs-2';
import 'chart.js/auto';

import SideNav from '../../navigation/SideNav';
import UserSettingBar from '../dashboard/user-settings/userSettingBar';
import LogWorkoutTrigger from './logout-workout/LogWorkoutTrigger';
import WorkoutHistorySwiper, { type WorkoutHistoryItem } from './history-workout/WorkoutHistorySwiper';
import WorkoutHistoryModal from './history-workout/history-modal/WorkoutHistoryModal';
import { apiFetch } from '../../../utils/api';
import { db } from '../../../config/firebase';
import type { AdditionalProfile, FirestoreUser, RequiredProfile } from '../profile/profileOptions/types';
import './AnalyticsPage.css';

type FirestoreTimestamp = {
  seconds?: number;
  _seconds?: number;
  toDate?: () => Date;
};

type ProcessedSnapshot = {
  userMetrics?: Record<string, unknown>;
  createdAt?: string | FirestoreTimestamp;
};

type ProcessedResponse = {
  snapshots?: ProcessedSnapshot[];
};

type SnapshotPoint = {
  createdAt: Date | null;
  weightKg: number | null;
  bmi: number | null;
  activityLevel: string | null;
  trainingDays: number | null;
  targetTraining: number | null;
  targetWeight: number | null;
  sleepHours: number | null;
  waterLiters: number | null;
  stressLevel: string | null;
};

type CombinedMetrics = SnapshotPoint & {
  wellnessScore: number | null;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveTimestamp = (value?: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const maybeTimestamp = value as FirestoreTimestamp;
    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate() ?? null;
    }
    const seconds = maybeTimestamp._seconds ?? maybeTimestamp.seconds;
    if (typeof seconds === 'number') {
      return new Date(seconds * 1000);
    }
  }
  return null;
};

const stressToScore = (stress: unknown) => {
  if (typeof stress !== 'string') return 5;
  const key = stress.toLowerCase();
  if (key === 'low') return 9;
  if (key === 'moderate') return 6;
  if (key === 'high') return 3;
  return 5;
};

const activityToScore = (activity: unknown) => {
  if (typeof activity !== 'string') return 45;
  const map: Record<string, number> = {
    sedentary: 20,
    light: 40,
    lightly_active: 55,
    moderate: 70,
    active: 80,
    very_active: 90,
    extra_active: 95
  };
  return map[activity] ?? 55;
};

const activityToTargetDays = (activity: string | null) => {
  if (!activity) return null;
  const map: Record<string, number> = {
    sedentary: 2,
    light: 3,
    lightly_active: 3,
    moderate: 4,
    active: 5,
    very_active: 6,
    extra_active: 6
  };
  return map[activity] ?? null;
};

const formatDayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const bmiScore = (bmi: number | null) => {
  if (bmi == null) return 50;
  const diff = Math.abs(bmi - 22);
  const penalty = Math.min(diff * 8, 70);
  return Math.max(100 - penalty, 20);
};

const trainingScore = (trainingDays: number | null, targetDays: number | null) => {
  if (trainingDays == null) return 40;
  const goal = Math.max(targetDays ?? 5, 1);
  const ratio = Math.min(trainingDays / goal, 1);
  return Math.round(50 + ratio * 50);
};

const habitScore = (sleepHours: number | null, waterLiters: number | null, stressLevel: string | null) => {
  let score = 55;
  if (sleepHours != null) {
    const diff = Math.abs(7 - sleepHours);
    score += Math.max(0, 10 - diff * 3);
  }
  if (waterLiters != null) {
    score += Math.min(waterLiters * 2, 15);
  }
  score += stressToScore(stressLevel) - 5;
  return Math.max(30, Math.min(score, 100));
};

const bmiClassification = (bmi: number | null) => {
  if (bmi == null) return '—';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
};

const pickNumber = (source: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = source?.[key];
    const numeric = toNumber(value);
    if (numeric != null) return numeric;
  }
  return null;
};

const normalizeSnapshot = (snapshot: ProcessedSnapshot): SnapshotPoint => {
  const metrics = (snapshot.userMetrics ?? {}) as Record<string, unknown>;
  const current = (metrics.current_state ?? {}) as Record<string, unknown>;
  const target = (metrics.target_state ?? {}) as Record<string, unknown>;
  const habits = (metrics.habits ?? {}) as Record<string, unknown>;
  const preferences = (metrics.preferences ?? {}) as Record<string, unknown>;
  const normalized = (current.normalized ?? metrics.normalized ?? {}) as Record<string, unknown>;
  const strength = (current.strength ?? {}) as Record<string, unknown>;
    const goals = (metrics.goals ?? {}) as Record<string, unknown>; // Local goals variable

  const weightKg = pickNumber(
    current,
    'weight_kg',
    'weightKg'
  ) ?? pickNumber(normalized, 'weightKg', 'weight_kg');

  const bmi = pickNumber(current, 'bmi') ?? pickNumber(normalized, 'bmi');

  const trainingDays =
    pickNumber(strength as Record<string, unknown>, 'trainingDaysPerWeek') ??
    pickNumber(current, 'weekly_activity_frequency');

  const targetTraining =
    pickNumber(target, 'training_days_per_week') ??
      pickNumber(goals, 'trainingDaysPerWeek') ??
    activityToTargetDays(
      (target.activity_level ?? target.activityLevel ?? current.activity_level ?? current.activityLevel ?? null) as string | null
    );

  const targetWeight =
    pickNumber(target, 'weight_kg', 'desired_weight') ??
      pickNumber(goals, 'targetWeightKg', 'desiredWeightKg');

  return {
    createdAt: resolveTimestamp(snapshot.createdAt),
    weightKg,
    bmi,
    activityLevel: (current.activity_level ?? current.activityLevel ?? null) as string | null,
    trainingDays,
    targetTraining,
    targetWeight,
    sleepHours: pickNumber(habits, 'sleep_hours', 'sleepHours'),
    waterLiters: pickNumber(habits, 'water_intake_liters', 'waterIntakeLiters'),
    stressLevel: (habits.stress_level ?? habits.stressLevel ?? preferences.stress_level ?? null) as string | null
  };
};

const normalizeFromUserDoc = (userDoc: FirestoreUser | null): SnapshotPoint | null => {
  if (!userDoc) return null;
  const required = (userDoc.requiredProfile ?? {}) as Partial<RequiredProfile>;
  const bonus = (userDoc.additionalProfile ?? {}) as Partial<AdditionalProfile>;
  const strength = (bonus.strengthMetrics ?? {}) as Partial<AdditionalProfile['strengthMetrics']>;

  const weight = toNumber(required.weight);
  const height = toNumber(required.height);
  const bmi = weight != null && height != null && height > 0 ? weight / Math.pow(height / 100, 2) : null;

  const activityLevel = required.activityLevel ?? bonus.desiredActivityLevel ?? null;

  return {
    createdAt: null,
    weightKg: weight ?? null,
    bmi,
    activityLevel,
    trainingDays: toNumber(strength.trainingDaysPerWeek),
    targetTraining: activityToTargetDays(activityLevel ?? null),
    targetWeight: null,
    sleepHours: null,
    waterLiters: null,
    stressLevel: null
  };
};

const computeWellness = (point: SnapshotPoint) => {
  const bmiComponent = bmiScore(point.bmi);
  const activityComponent = activityToScore(point.activityLevel);
  const trainingComponent = trainingScore(point.trainingDays, point.targetTraining);
  const habitComponent = habitScore(point.sleepHours, point.waterLiters, point.stressLevel);
  return Math.round(
    bmiComponent * 0.3 +
    activityComponent * 0.3 +
    trainingComponent * 0.2 +
    habitComponent * 0.2
  );
};

const AnalyticsPage: React.FC<{ user: User }> = ({ user }) => {
  const displayName = user.displayName ?? user.email ?? 'friend';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<ProcessedSnapshot[]>([]);
  const [userDoc, setUserDoc] = useState<FirestoreUser | null>(null);
  const [analyticsDoc, setAnalyticsDoc] = useState<Record<string, unknown> | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutHistoryItem[]>([]);
  const [historyModalState, setHistoryModalState] = useState<{
    open: boolean;
    key: string | null;
    weekday: string;
    dateLabel: string;
    workouts: WorkoutHistoryItem[];
  }>({
    open: false,
    key: null,
    weekday: '',
    dateLabel: '',
    workouts: []
  });

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ProcessedResponse>('/ai/processed?limit=20');
      setSnapshots(data.snapshots ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  useEffect(() => {
    const workoutsRef = collection(db, 'users', user.uid, 'workouts');
    const workoutsQuery = query(workoutsRef, orderBy('createdAt', 'desc'), limit(200));
    const unsubscribe = onSnapshot(
      workoutsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const createdAtRaw = data.createdAt ?? null;
          const createdAtDate = resolveTimestamp(createdAtRaw);
          return {
            id: docSnap.id,
            createdAt: createdAtRaw,
            createdAtDate,
            type: typeof data.type === 'string' ? data.type : null,
            durationMinutes: toNumber(data.durationMinutes),
            intensity: typeof data.intensity === 'string' ? data.intensity : null,
            notes: typeof data.notes === 'string' ? data.notes : null,
            weightKg: toNumber(data.weightKg)
          } satisfies WorkoutHistoryItem;
        });
        setRecentWorkouts(items);
      },
      () => {
        // ignore subscription errors; component already guards with processed snapshots
      }
    );
    return () => unsubscribe();
  }, [user.uid]);

  const countTrainingDaysFromWorkouts = (workouts: WorkoutHistoryItem[]) => {
    const days = new Set<string>();
    workouts.forEach((w) => {
      try {
        const createdAt = w.createdAtDate ?? resolveTimestamp(w.createdAt);
        const d = createdAt ? new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate()) : null;
        if (!d || Number.isNaN(d.getTime())) return;
        days.add(formatDayKey(d));
      } catch {
        // ignore invalid dates
      }
    });
    return days.size;
  };

  const handleHistoryDaySelect = useCallback((info: {
    id: string;
    date: Date;
    workouts: WorkoutHistoryItem[];
    weekday: string;
    dateLabel: string;
  }) => {
    const sorted = info.workouts.slice().sort((a, b) => {
      const aTime = a.createdAtDate ? a.createdAtDate.getTime() : 0;
      const bTime = b.createdAtDate ? b.createdAtDate.getTime() : 0;
      return bTime - aTime;
    });
    setHistoryModalState({
      open: true,
      key: info.id,
      weekday: info.weekday,
      dateLabel: info.dateLabel,
      workouts: sorted
    });
  }, []);

  const closeHistoryModal = useCallback(() => {
    setHistoryModalState((prev) => ({
      ...prev,
      open: false
    }));
  }, []);

  useEffect(() => {
    if (!historyModalState.key) return;
    const key = historyModalState.key;
    const nextWorkouts = recentWorkouts
      .map((workout) => {
        const createdAtDate = workout.createdAtDate ?? resolveTimestamp(workout.createdAt);
        return {
          ...workout,
          createdAtDate
        };
      })
      .filter((workout) => workout.createdAtDate && formatDayKey(workout.createdAtDate) === key)
      .sort((a, b) => {
        const aTime = a.createdAtDate ? a.createdAtDate.getTime() : 0;
        const bTime = b.createdAtDate ? b.createdAtDate.getTime() : 0;
        return bTime - aTime;
      });

    setHistoryModalState((prev) => {
      if (prev.key !== key) return prev;
      return {
        ...prev,
        workouts: nextWorkouts
      };
    });
  }, [recentWorkouts, historyModalState.key]);

  const fetchUserDocData = useCallback(async (): Promise<FirestoreUser | null> => {
    try {
      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      return snap.exists() ? (snap.data() as FirestoreUser) : null;
    } catch {
      return null;
    }
  }, [user.uid]);

  const fetchLatestAnalytics = useCallback(async (): Promise<Record<string, unknown> | null> => {
    try {
      const aRef = doc(db, 'users', user.uid, 'analytics', 'latest');
      const aSnap = await getDoc(aRef);
      return aSnap.exists() ? (aSnap.data() as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [user.uid]);

  const reloadUserDoc = useCallback(async () => {
    const data = await fetchUserDocData();
    setUserDoc(data);
  }, [fetchUserDocData]);

  const reloadAnalyticsDoc = useCallback(async () => {
    const data = await fetchLatestAnalytics();
    setAnalyticsDoc(data);
  }, [fetchLatestAnalytics]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const [userData, analyticsData] = await Promise.all([
        fetchUserDocData(),
        fetchLatestAnalytics()
      ]);
      if (!active) return;
      setUserDoc(userData);
      setAnalyticsDoc(analyticsData);
    };
    void run();
    return () => {
      active = false;
    };
  }, [fetchLatestAnalytics, fetchUserDocData]);

  const handleWorkoutLogged = useCallback(() => {
    void loadSnapshots();
    void reloadAnalyticsDoc();
    void reloadUserDoc();
  }, [loadSnapshots, reloadAnalyticsDoc, reloadUserDoc]);

  const snapshotPoints = useMemo(
    () => snapshots.map(normalizeSnapshot).filter(Boolean),
    [snapshots]
  );

  const combinedSeries: CombinedMetrics[] = useMemo(() => {
    const points = snapshotPoints.map((point) => ({
      ...point,
      wellnessScore: computeWellness(point)
    }));

    if (points.length === 0) {
      const backup = normalizeFromUserDoc(userDoc);
      if (backup) {
        return [{
          ...backup,
          wellnessScore: computeWellness(backup)
        }];
      }
    }

    return points;
  }, [snapshotPoints, userDoc]);

  const weightSeries = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    const labels: string[] = [];
    const weight: number[] = [];
    const bmi: number[] = [];

    combinedSeries.forEach((point, index) => {
      const label = point.createdAt
        ? formatter.format(point.createdAt)
        : index === 0
          ? 'Latest'
          : `Snapshot ${index + 1}`;
      labels.push(label);
      weight.push(point.weightKg ?? NaN);
      bmi.push(point.bmi ?? NaN);
    });

    return {
      labels,
      datasets: [
        {
          label: 'Weight (kg)',
          data: weight,
          borderColor: 'rgba(54, 162, 235, 0.8)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.3,
          spanGaps: true
        },
        {
          label: 'BMI',
          data: bmi,
          borderColor: 'rgba(255, 99, 132, 0.8)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          tension: 0.3,
          spanGaps: true,
          yAxisID: 'bmi-axis'
        }
      ]
    };
  }, [combinedSeries]);

  const wellnessSeries = useMemo(() => {
    if (!combinedSeries.some((pt) => pt.wellnessScore != null)) {
      return null;
    }
    const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    return {
      labels: combinedSeries.map((point, index) =>
        point.createdAt
          ? formatter.format(point.createdAt)
          : index === 0
          ? 'Latest'
          : `Snapshot ${index + 1}`
      ),
      datasets: [
        {
          label: 'Wellness score',
          data: combinedSeries.map((point) => point.wellnessScore ?? NaN),
          borderColor: 'rgba(99, 181, 125, 0.85)',
          backgroundColor: 'rgba(99, 181, 125, 0.25)',
          tension: 0.25,
          fill: true,
          spanGaps: true
        }
      ]
    };
  }, [combinedSeries]);

  const baseLatestMetrics = combinedSeries[0] ?? null;

  const latestWeightKg = useMemo(() => {
    const analyticWeight = typeof analyticsDoc?.weightKg === 'number' ? analyticsDoc.weightKg : null;
    if (analyticWeight != null) return analyticWeight;
    if (baseLatestMetrics?.weightKg != null) return baseLatestMetrics.weightKg;
    const profileWeight = toNumber((userDoc?.requiredProfile as Partial<RequiredProfile> | null)?.weight);
    return profileWeight;
  }, [analyticsDoc, baseLatestMetrics, userDoc]);

  const profileCreationTime = useMemo(() => {
    if (userDoc?.createdAt != null) {
      // ensure Firestore timestamp-like objects are converted to a Date
      const resolved = resolveTimestamp(userDoc.createdAt as string | FirestoreTimestamp);
      if (resolved) return resolved;
    }
    return user.metadata?.creationTime ?? null;
  }, [userDoc, user.metadata?.creationTime]);
  const latestMetrics = useMemo<CombinedMetrics | null>(() => {
    if (!baseLatestMetrics) {
      if (latestWeightKg == null) {
        return null;
      }
      return {
        createdAt: null,
        weightKg: latestWeightKg,
        bmi: null,
        activityLevel: null,
        trainingDays: null,
        targetTraining: null,
        targetWeight: null,
        sleepHours: null,
        waterLiters: null,
        stressLevel: null,
        wellnessScore: null
      };
    }
    if (latestWeightKg == null || baseLatestMetrics.weightKg === latestWeightKg) {
      return baseLatestMetrics;
    }
    return {
      ...baseLatestMetrics,
      weightKg: latestWeightKg
    };
  }, [baseLatestMetrics, latestWeightKg]);

  const trainingDoughnut = useMemo(() => {
    if (!latestMetrics || latestMetrics.trainingDays == null || latestMetrics.targetTraining == null) {
      return null;
    }
    const target = Math.max(latestMetrics.targetTraining, 1);
    const attained = Math.max(Math.min(latestMetrics.trainingDays, target), 0);
    return {
      data: {
        labels: ['Completed', 'Remaining'],
        datasets: [
          {
            data: [attained, Math.max(target - attained, 0)],
            backgroundColor: ['rgba(99, 181, 125, 0.8)', 'rgba(229, 231, 235, 0.9)'],
            borderWidth: 0
          }
        ]
      },
      target
    };
  }, [latestMetrics]);

  const habitRadar = useMemo(() => {
    if (!latestMetrics) return null;
    const sleep = latestMetrics.sleepHours ?? 0;
    const water = latestMetrics.waterLiters ?? 0;
    const stressScore = stressToScore(latestMetrics.stressLevel);
    const activityScoreValue = activityToScore(latestMetrics.activityLevel);

    if (sleep === 0 && water === 0 && stressScore === 5 && activityScoreValue === 45) {
      return null;
    }

    return {
      labels: ['Sleep (hrs)', 'Hydration (L)', 'Stress balance', 'Activity score'],
      datasets: [
        {
          label: 'Wellness balance',
          data: [sleep, water, stressScore, activityScoreValue],
          backgroundColor: 'rgba(153, 102, 255, 0.2)',
          borderColor: 'rgba(153, 102, 255, 0.8)',
          pointBackgroundColor: 'rgba(153, 102, 255, 0.9)'
        }
      ]
    };
  }, [latestMetrics]);

  const weightTargetBar = useMemo(() => {
    if (!latestMetrics || latestMetrics.weightKg == null || latestMetrics.targetWeight == null) {
      return null;
    }
    return {
      labels: ['Current', 'Target'],
      datasets: [
        {
          label: 'Weight (kg)',
          data: [latestMetrics.weightKg, latestMetrics.targetWeight],
          backgroundColor: ['rgba(54, 162, 235, 0.7)', 'rgba(75, 192, 192, 0.7)'],
          borderRadius: 6,
          maxBarThickness: 48
        }
      ]
    };
  }, [latestMetrics]);

  const statCards: Array<{ label: string; value: string }> = (() => {
    if (!latestMetrics) return [];
    const cards: Array<{ label: string; value: string }> = [];

    if (latestMetrics.weightKg != null) {
      cards.push({
        label: 'Current weight',
        value: `${latestMetrics.weightKg.toFixed(1)} kg`
      });
    }

    if (latestMetrics.bmi != null) {
      cards.push({
        label: 'BMI',
        value: `${latestMetrics.bmi.toFixed(1)} · ${bmiClassification(latestMetrics.bmi)}`
      });
    }

    if (latestMetrics.wellnessScore != null) {
      cards.push({
        label: 'Wellness score',
        value: `${latestMetrics.wellnessScore}/100`
      });
    }

    // Prefer explicit recorded workouts if available; otherwise use latestMetrics.trainingDays
    const loggedAttained = recentWorkouts.length > 0 ? countTrainingDaysFromWorkouts(recentWorkouts) : null;
    const rawTrainingDays = latestMetrics.trainingDays != null ? Math.max(0, Math.floor(latestMetrics.trainingDays)) : null;
    const attained = rawTrainingDays ?? loggedAttained;
    if (attained != null) {
      const target = latestMetrics.targetTraining ?? activityToTargetDays(latestMetrics.activityLevel);
      if (target != null && target > 0) {
        const pct = Math.round((attained / target) * 100);
        cards.push({
          label: 'Training cadence',
          value: `${attained} of ${target} sessions (${pct}%)${loggedAttained != null && rawTrainingDays == null ? ' (from logs)' : ''}`
        });
      } else {
        cards.push({
          label: 'Training cadence',
          value: `${attained} sessions / week${loggedAttained != null && rawTrainingDays == null ? ' (from logs)' : ''}`
        });
      }
    }

    if (cards.length < 4) {
      cards.push({
        label: 'Activity level',
        value: latestMetrics.activityLevel ? latestMetrics.activityLevel.replace(/_/g, ' ') : '—'
      });
    }

    return cards;
  })();

  const hasWeightSeries = weightSeries.labels.length > 0 &&
    weightSeries.datasets.some((ds) => (ds.data as number[]).some((point) => Number.isFinite(point)));

  const renderBody = () => {
    if (loading) {
      return (
        <div className="analytics-placeholder">
          <div className="analytics-placeholder__content">
            <h2 className="analytics-placeholder__title">Fetching your metrics…</h2>
            <p className="analytics-placeholder__hint">We’re loading your latest health data. This might take a moment.</p>
          </div>
        </div>
      );
    }

    if (combinedSeries.length === 0) {
      return (
        <div className="analytics-placeholder">
          <div className="analytics-placeholder__content">
            <h2 className="analytics-placeholder__title">No analytics yet</h2>
            <p className="analytics-placeholder__hint">
              Complete your health profile and request AI insights to start tracking trends.
            </p>
            <div className="analytics-placeholder__actions">
              <button
                type="button"
                className="analytics-placeholder__cta"
                onClick={() => window.history.pushState({}, '', '/profile')}
              >
                Update profile
              </button>
              <button
                type="button"
                className="analytics-placeholder__cta"
                onClick={() => window.history.pushState({}, '', '/ai-insights')}
              >
                Generate insight
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="analytics-results">
        <section className="analytics-grid">
          <WorkoutHistorySwiper
            workouts={recentWorkouts}
            userCreationTime={user.metadata?.creationTime ?? null}
            profileCreationTime={profileCreationTime}
            onSelectDay={handleHistoryDaySelect}
            selectedDayKey={historyModalState.key}
          />
          {statCards.map((card) => (
            <article key={card.label} className="analytics-card">
              <span className="analytics-card-label">{card.label}</span>
              <strong className="analytics-card-value">{card.value}</strong>
            </article>
          ))}
        </section>

        <section className="analytics-panels">
          {hasWeightSeries && (
            <article className="analytics-panel">
              <header>
                <h2>Body metrics trend</h2>
                <p>Track weight and BMI across recent processed snapshots.</p>
              </header>
              <div className="analytics-chart">
                <Line
                  data={weightSeries}
                  options={{
                    maintainAspectRatio: false,
                    scales: {
                      y: { title: { display: true, text: 'Weight (kg)' } },
                      'bmi-axis': {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'BMI' }
                      }
                    },
                    plugins: { legend: { display: true } }
                  }}
                />
              </div>
            </article>
          )}

          {wellnessSeries && (
            <article className="analytics-panel">
              <header>
                <h2>Wellness score</h2>
                <p>Overall balance based on BMI, activity, training cadence, and habits.</p>
              </header>
              <div className="analytics-chart">
                <Line
                  data={wellnessSeries}
                  options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: {
                        beginAtZero: true,
                        suggestedMax: 100
                      }
                    }
                  }}
                />
              </div>
            </article>
          )}

          {weightTargetBar && (
            <article className="analytics-panel">
              <header>
                <h2>Goal alignment</h2>
                <p>Compare your current weight with the target you set.</p>
              </header>
              <div className="analytics-chart">
                {(() => {
                  const datasetValues = (weightTargetBar.datasets[0].data as number[]).filter((v) => Number.isFinite(v));
                  const suggestedMax = datasetValues.length > 0 ? Math.max(...datasetValues) + 5 : 10;
                  return (
                    <Bar
                      data={weightTargetBar}
                      options={{
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          y: {
                            beginAtZero: true,
                            suggestedMax
                          }
                        }
                      }}
                    />
                  );
                })()}
              </div>
            </article>
          )}

          {trainingDoughnut && (
            <article className="analytics-panel">
              <header>
                <h2>Training cadence</h2>
                <p>{`Targeting ${trainingDoughnut.target} sessions per week`}</p>
              </header>
              <div className="analytics-chart analytics-chart--centered">
                <Doughnut
                  data={trainingDoughnut.data}
                  options={{
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                      legend: { position: 'bottom' }
                    }
                  }}
                />
              </div>
            </article>
          )}

          {habitRadar && (
            <article className="analytics-panel analytics-panel--wide">
              <header>
                <h2>Wellness balance</h2>
                <p>Sleep, hydration, stress, and activity signals from your latest data.</p>
              </header>
              <div className="analytics-chart">
                <Radar
                  data={habitRadar}
                  options={{
                    maintainAspectRatio: false,
                    scales: {
                      r: {
                        beginAtZero: true,
                        suggestedMax: 10,
                        ticks: { showLabelBackdrop: false, stepSize: 2 }
                      }
                    },
                    plugins: { legend: { display: false } }
                  }}
                />
              </div>
            </article>
          )}
        </section>
      </div>
    );
  };

  return (
    <div className="dashboard-shell analytics-shell">
      <SideNav activeKey="analytics" />
      <div className="dashboard-canvas">
        <main className="analytics-main" role="main">
          <UserSettingBar name={displayName} photoURL={user.photoURL ?? null} />

          <div className="analytics-content">
            <header className="analytics-header">
              <div>
                <p className="analytics-subtitle">Trends &amp; performance</p>
                <h1 className="analytics-title">Analytics</h1>
                <p className="analytics-intro">
                  Visualise your processed wellness metrics and spot patterns across time.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  type="button"
                  className="analytics-refresh"
                  onClick={() => void loadSnapshots()}
                  disabled={loading}
                >
                  {loading ? 'Refreshing…' : 'Refresh data'}
                </button>
                <LogWorkoutTrigger
                  uid={user.uid}
                  currentWeightKg={
                    typeof analyticsDoc?.weightKg === 'number'
                      ? (analyticsDoc?.weightKg as number)
                      : null
                  }
                  onLogged={handleWorkoutLogged}
                />
              </div>
            </header>

            {error && (
              <p role="alert" className="analytics-error">{error}</p>
            )}

            <div className="analytics-body">{renderBody()}</div>
            <WorkoutHistoryModal
              open={historyModalState.open}
              weekday={historyModalState.weekday}
              dateLabel={historyModalState.dateLabel}
              workouts={historyModalState.workouts}
              onClose={closeHistoryModal}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AnalyticsPage;

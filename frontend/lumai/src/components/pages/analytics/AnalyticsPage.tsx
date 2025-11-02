import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Line, Bar, Radar, Doughnut } from 'react-chartjs-2';
import 'chart.js/auto';
import type { ChartData } from 'chart.js';

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
const startOfDay = (value: Date) => {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const startOfWeek = (value: Date) => {
  const day = startOfDay(value);
  const dayIndex = day.getDay();
  const diff = (dayIndex + 6) % 7; // Monday as start of week
  day.setDate(day.getDate() - diff);
  return day;
};

const endOfWeek = (value: Date) => {
  const start = startOfWeek(value);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

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
  const weightMeasuredAt = toNumber((required as Record<string, unknown>).weightMeasuredAt);

  const activityLevel = required.activityLevel ?? bonus.desiredActivityLevel ?? null;

  return {
    createdAt: weightMeasuredAt != null ? new Date(weightMeasuredAt) : null,
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
          weightKg: toNumber(data.weightKg),
          sleepHours: toNumber(data.sleepHours),
          waterLiters: toNumber(data.waterLiters),
          stressLevel: typeof data.stressLevel === 'string' ? data.stressLevel : null,
          activityLevel: typeof data.activityLevel === 'string' ? data.activityLevel : null
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

  const latestHeightCm = useMemo(() => {
    const required = (userDoc?.requiredProfile ?? {}) as Partial<RequiredProfile>;
    const heightFromRequired = required?.height;
    const numericHeight = heightFromRequired != null ? toNumber(heightFromRequired) : null;
    if (numericHeight != null) return numericHeight;

    // fall back to any ad-hoc height field if present on the additional profile payload
    const additionalRaw = userDoc?.additionalProfile as Record<string, unknown> | null | undefined;
    if (additionalRaw && 'height' in additionalRaw) {
      const maybeHeight = toNumber(additionalRaw.height as number | string | null | undefined);
      if (maybeHeight != null) return maybeHeight;
    }

    return null;
  }, [userDoc]);

  const combinedSeries: CombinedMetrics[] = useMemo(() => {
    type CombinedAccumulator = { createdAt: Date | null } & Partial<CombinedMetrics>;
    const byDay = new Map<string, CombinedAccumulator>();

    const mergePoint = (point: SnapshotPoint) => {
      const date = point.createdAt ?? null;
      const key = date ? formatDayKey(startOfDay(date)) : 'latest';
      const existing: CombinedAccumulator = byDay.get(key) ?? { createdAt: date ?? null };

      if (date && (!existing.createdAt || date > existing.createdAt)) {
        existing.createdAt = date;
      }

      if (point.weightKg != null) existing.weightKg = point.weightKg;
      if (point.bmi != null) existing.bmi = point.bmi;
      if (point.activityLevel != null) existing.activityLevel = point.activityLevel;
      if (point.trainingDays != null) existing.trainingDays = point.trainingDays;
      if (point.targetTraining != null) existing.targetTraining = point.targetTraining;
      if (point.targetWeight != null) existing.targetWeight = point.targetWeight;
      if (point.sleepHours != null) existing.sleepHours = point.sleepHours;
      if (point.waterLiters != null) existing.waterLiters = point.waterLiters;
      if (point.stressLevel != null) existing.stressLevel = point.stressLevel;

      byDay.set(key, existing);
    };

    snapshotPoints.forEach((point) => {
      mergePoint(point);
    });

    if (analyticsDoc) {
      const measuredAtMs = typeof analyticsDoc.weightMeasuredAt === 'number' ? analyticsDoc.weightMeasuredAt : null;
      const derivedCreatedAt = measuredAtMs != null
        ? new Date(measuredAtMs)
        : resolveTimestamp(analyticsDoc.updatedAt ?? analyticsDoc.createdAt ?? null);

      const analyticPoint: SnapshotPoint = {
        createdAt: derivedCreatedAt,
        weightKg: toNumber(analyticsDoc.weightKg),
        bmi: toNumber(analyticsDoc.bmi),
        activityLevel: typeof analyticsDoc.activityLevel === 'string' ? analyticsDoc.activityLevel : null,
        trainingDays: toNumber(analyticsDoc.trainingDays),
        targetTraining: toNumber(analyticsDoc.targetTraining),
        targetWeight: toNumber(analyticsDoc.targetWeight),
        sleepHours: toNumber(analyticsDoc.sleepHours),
        waterLiters: toNumber(analyticsDoc.waterLiters),
        stressLevel: typeof analyticsDoc.stressLevel === 'string' ? analyticsDoc.stressLevel : null
      };
      mergePoint(analyticPoint);
    }

    const backup = normalizeFromUserDoc(userDoc);
    if (backup) {
      mergePoint(backup);
    }

    const sortedWorkouts = recentWorkouts
      .map((workout) => {
        const createdAtDate = workout.createdAtDate ?? resolveTimestamp(workout.createdAt);
        if (!createdAtDate) return null;
        const weight = toNumber(workout.weightKg);
        const sleepHours = toNumber(workout.sleepHours);
        const waterLiters = toNumber(workout.waterLiters);
        const stressLevel = typeof workout.stressLevel === 'string' ? workout.stressLevel : null;
        const activityLevel = typeof workout.activityLevel === 'string' ? workout.activityLevel : null;
        if (
          weight == null &&
          sleepHours == null &&
          waterLiters == null &&
          !stressLevel &&
          !activityLevel
        ) {
          return null;
        }
        return { createdAtDate, weight, sleepHours, waterLiters, stressLevel, activityLevel };
      })
      .filter((entry): entry is {
        createdAtDate: Date;
        weight: number | null;
        sleepHours: number | null;
        waterLiters: number | null;
        stressLevel: string | null;
        activityLevel: string | null;
      } => Boolean(entry))
      .sort((a, b) => a.createdAtDate.getTime() - b.createdAtDate.getTime());

    sortedWorkouts.forEach(({ createdAtDate, weight, sleepHours, waterLiters, stressLevel, activityLevel }) => {
      let bmi: number | null = null;
      if (weight != null && latestHeightCm && latestHeightCm > 0) {
        const heightMeters = latestHeightCm / 100;
        bmi = weight / (heightMeters * heightMeters);
      }
      mergePoint({
        createdAt: createdAtDate,
        weightKg: weight ?? null,
        bmi,
        activityLevel: activityLevel,
        trainingDays: null,
        targetTraining: null,
        targetWeight: null,
        sleepHours: sleepHours,
        waterLiters: waterLiters,
        stressLevel: stressLevel
      });
    });

    const mergedPoints = Array.from(byDay.values()).map((partial) => {
      const snapshot: SnapshotPoint = {
        createdAt: partial.createdAt ?? null,
        weightKg: partial.weightKg ?? null,
        bmi: partial.bmi ?? null,
        activityLevel: partial.activityLevel ?? null,
        trainingDays: partial.trainingDays ?? null,
        targetTraining: partial.targetTraining ?? null,
        targetWeight: partial.targetWeight ?? null,
        sleepHours: partial.sleepHours ?? null,
        waterLiters: partial.waterLiters ?? null,
        stressLevel: partial.stressLevel ?? null
      };
      return {
        ...snapshot,
        wellnessScore: computeWellness(snapshot)
      };
    });

    if (mergedPoints.length === 0 && backup) {
      return [{
        ...backup,
        wellnessScore: computeWellness(backup)
      }];
    }

    return mergedPoints.sort((a, b) => {
      const aTime = a.createdAt ? a.createdAt.getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.createdAt ? b.createdAt.getTime() : Number.POSITIVE_INFINITY;
      return bTime - aTime;
    });
  }, [snapshotPoints, analyticsDoc, userDoc, recentWorkouts, latestHeightCm]);

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

  const progressChartSeries = useMemo(() => {
    if (combinedSeries.length === 0) {
      return null;
    }

    const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    const labels = combinedSeries.map((point, index) =>
      point.createdAt
        ? formatter.format(point.createdAt)
        : index === 0
        ? 'Latest'
        : `Snapshot ${index + 1}`
    );

    // Weight data (left Y-axis)
    const weightData = combinedSeries.map((point) => point.weightKg ?? NaN);

    // Wellness score data (right Y-axis)
    const wellnessData = combinedSeries.map((point) => point.wellnessScore ?? NaN);

    // Activity level data (converted to numeric scores, secondary right Y-axis)
    const activityData = combinedSeries.map((point) => {
      if (!point.activityLevel) return NaN;
      return activityToScore(point.activityLevel);
    });

    return {
      labels,
      datasets: [
        {
          label: 'Weight (kg)',
          data: weightData,
          borderColor: 'rgba(54, 162, 235, 0.9)',
          backgroundColor: 'rgba(54, 162, 235, 0.1)',
          yAxisID: 'weight',
          tension: 0.3,
          spanGaps: true,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Wellness Score',
          data: wellnessData,
          borderColor: 'rgba(99, 181, 125, 0.9)',
          backgroundColor: 'rgba(99, 181, 125, 0.1)',
          yAxisID: 'wellness',
          tension: 0.3,
          spanGaps: true,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Activity Level',
          data: activityData,
          borderColor: 'rgba(255, 159, 64, 0.9)',
          backgroundColor: 'rgba(255, 159, 64, 0.1)',
          yAxisID: 'activity',
          tension: 0.3,
          spanGaps: true,
          pointRadius: 4,
          pointHoverRadius: 6
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

  const trainingTargetSeries = useMemo(() => {
    return combinedSeries
      .filter((point) => point.targetTraining != null)
      .map((point) => ({
        date: point.createdAt ? startOfDay(point.createdAt) : null,
        value: point.targetTraining as number
      }))
      .sort((a, b) => {
        const aTime = a.date ? a.date.getTime() : Number.NEGATIVE_INFINITY;
        const bTime = b.date ? b.date.getTime() : Number.NEGATIVE_INFINITY;
        return aTime - bTime;
      });
  }, [combinedSeries]);

  const resolveTargetTraining = useCallback(
    (referenceDate: Date) => {
      let target: number | null = null;
      const refTime = referenceDate.getTime();
      for (const entry of trainingTargetSeries) {
        if (!entry.date || entry.date.getTime() <= refTime) {
          target = entry.value;
        } else {
          break;
        }
      }
      if (target != null) {
        return target;
      }
      return latestMetrics?.targetTraining ?? null;
    },
    [latestMetrics?.targetTraining, trainingTargetSeries]
  );

  const trainingActivity = useMemo(() => {
    const dayCounts = new Map<string, {
      date: Date;
      count: number;
      totalWeight: number;
      weightSamples: number;
    }>();
    recentWorkouts.forEach((workout) => {
      const createdAt = workout.createdAtDate ?? resolveTimestamp(workout.createdAt);
      if (!createdAt) return;
      const day = startOfDay(createdAt);
      const key = formatDayKey(day);
      const existing = dayCounts.get(key);
      const weightSample = toNumber(workout.weightKg);
      if (existing) {
        existing.count += 1;
        if (weightSample != null) {
          existing.totalWeight += weightSample;
          existing.weightSamples += 1;
        }
      } else {
        dayCounts.set(key, {
          date: day,
          count: 1,
          totalWeight: weightSample ?? 0,
          weightSamples: weightSample != null ? 1 : 0
        });
      }
    });

    const today = startOfDay(new Date());

    const parseRegistrationCandidate = (value: unknown) => {
      const resolved = resolveTimestamp(value);
      return resolved ? startOfDay(resolved) : null;
    };

    const registrationCandidates = [
      parseRegistrationCandidate(profileCreationTime),
      parseRegistrationCandidate(user.metadata?.creationTime ?? null)
    ].filter((value): value is Date => Boolean(value));

    const registration =
      registrationCandidates.length > 0
        ? registrationCandidates.reduce((earliest, current) => (current < earliest ? current : earliest))
        : null;

    const dailyFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    const dailyRange = 14;
    const daily: Array<{
      key: string;
      date: Date;
      label: string;
      count: number;
      aiDailyTarget: number | null;
      avgWeight: number | null;
    }> = [];

    for (let offset = dailyRange - 1; offset >= 0; offset -= 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - offset);
      if (registration && day < registration) {
        continue;
      }
      const normalizedDay = startOfDay(day);
      const key = formatDayKey(normalizedDay);
      const entry = dayCounts.get(key);
      const count = entry ? entry.count : 0;
      const aiWeeklyTarget = resolveTargetTraining(endOfWeek(normalizedDay));
      const avgWeight = entry && entry.weightSamples > 0 ? entry.totalWeight / entry.weightSamples : null;
      daily.push({
        key,
        date: normalizedDay,
        label: dailyFormatter.format(normalizedDay),
        count,
        aiDailyTarget: aiWeeklyTarget != null ? aiWeeklyTarget / 7 : null,
        avgWeight
      });
    }

    const weekFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    const weekly: Array<{
      key: string;
      start: Date;
      end: Date;
      label: string;
      count: number;
      activeDays: number;
      aiTarget: number | null;
      avgWeight: number | null;
    }> = [];

    const baseWeekStart = startOfWeek(today);
    const weeksRange = 8;
    for (let offset = weeksRange - 1; offset >= 0; offset -= 1) {
      const weekStart = new Date(baseWeekStart);
      weekStart.setDate(baseWeekStart.getDate() - offset * 7);
      const normalizedStart = startOfWeek(weekStart);
      const weekEnd = endOfWeek(normalizedStart);
      if (registration && weekEnd < registration) {
        continue;
      }
      let count = 0;
      let activeDays = 0;
      let weightTotal = 0;
      let weightSamples = 0;
      for (let i = 0; i < 7; i += 1) {
        const day = new Date(normalizedStart);
        day.setDate(normalizedStart.getDate() + i);
        const key = formatDayKey(day);
        const entry = dayCounts.get(key);
        const dayCount = entry ? entry.count : 0;
        count += dayCount;
        if (dayCount > 0) {
          activeDays += 1;
        }
        if (entry && entry.weightSamples > 0) {
          weightTotal += entry.totalWeight;
          weightSamples += entry.weightSamples;
        }
      }
      const aiTarget = resolveTargetTraining(weekEnd);
      const avgWeight = weightSamples > 0 ? weightTotal / weightSamples : null;
      weekly.push({
        key: formatDayKey(normalizedStart),
        start: normalizedStart,
        end: weekEnd,
        label: `Week of ${weekFormatter.format(normalizedStart)}`,
        count,
        activeDays,
        aiTarget,
        avgWeight
      });
    }

    const lastWeek = weekly.length > 0 ? weekly[weekly.length - 1] : null;
    const trailingSevenDays = daily.slice(-7).reduce((sum, day) => sum + day.count, 0);

    return {
      daily,
      weekly,
      lastWeek,
      trailingSevenDays
    };
  }, [profileCreationTime, recentWorkouts, resolveTargetTraining, user.metadata?.creationTime]);

  const weeklyTrainingSeries = useMemo<ChartData<'bar', number[], string> | null>(() => {
    if (!trainingActivity || trainingActivity.weekly.length === 0) {
      return null;
    }
    const labels = trainingActivity.weekly.map((week) => week.label);
    const logged = trainingActivity.weekly.map((week) => week.count);
    const aiTarget = trainingActivity.weekly.map((week) => (week.aiTarget ?? NaN));
    const avgWeight = trainingActivity.weekly.map((week) => (week.avgWeight ?? NaN));

    return {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Logged workouts',
          data: logged,
          yAxisID: 'sessions',
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderRadius: 6,
          maxBarThickness: 48
        },
        {
          type: 'line',
          label: 'AI target per week',
          data: aiTarget,
          yAxisID: 'sessions',
          borderColor: 'rgba(234, 88, 12, 0.9)',
          backgroundColor: 'rgba(234, 88, 12, 0.2)',
          tension: 0.3,
          spanGaps: true
        },
        {
          type: 'line',
          label: 'Avg weight (kg)',
          data: avgWeight,
          yAxisID: 'weight',
          borderColor: 'rgba(30, 64, 175, 0.85)',
          backgroundColor: 'rgba(30, 64, 175, 0.15)',
          tension: 0.25,
          spanGaps: true
        }
      ]
    } as ChartData<'bar', number[], string>;
  }, [trainingActivity]);

  const dailyTrainingSeries = useMemo<ChartData<'bar', number[], string> | null>(() => {
    if (!trainingActivity || trainingActivity.daily.length === 0) {
      return null;
    }
    const labels = trainingActivity.daily.map((day) => day.label);
    const logged = trainingActivity.daily.map((day) => day.count);
    const aiTarget = trainingActivity.daily.map((day) => (day.aiDailyTarget ?? NaN));
    const avgWeight = trainingActivity.daily.map((day) => (day.avgWeight ?? NaN));

    return {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Logged workouts',
          data: logged,
          yAxisID: 'sessions',
          backgroundColor: 'rgba(99, 181, 125, 0.75)',
          borderRadius: 6,
          maxBarThickness: 36
        },
        {
          type: 'line',
          label: 'AI target per day',
          data: aiTarget,
          yAxisID: 'sessions',
          borderColor: 'rgba(14, 116, 144, 0.9)',
          backgroundColor: 'rgba(14, 116, 144, 0.2)',
          tension: 0.25,
          spanGaps: true
        },
        {
          type: 'line',
          label: 'Avg weight (kg)',
          data: avgWeight,
          yAxisID: 'weight',
          borderColor: 'rgba(79, 70, 229, 0.85)',
          backgroundColor: 'rgba(79, 70, 229, 0.15)',
          tension: 0.2,
          spanGaps: true
        }
      ]
    } as ChartData<'bar', number[], string>;
  }, [trainingActivity]);

  const trainingDoughnut = useMemo(() => {
    const lastWeek = trainingActivity?.lastWeek;
    const targetValue = lastWeek?.aiTarget ?? latestMetrics?.targetTraining ?? null;
    const attainedSessions = lastWeek ? lastWeek.count : latestMetrics?.trainingDays ?? null;

    if (targetValue == null || targetValue <= 0 || attainedSessions == null) {
      return null;
    }

    const attained = Math.max(attainedSessions, 0);
    const remaining = Math.max(targetValue - attained, 0);

    return {
      data: {
        labels: ['Completed', 'Remaining'],
        datasets: [
          {
            data: [Math.min(attained, targetValue), remaining],
            backgroundColor: ['rgba(99, 181, 125, 0.8)', 'rgba(229, 231, 235, 0.9)'],
            borderWidth: 0
          }
        ]
      },
      target: targetValue,
      attained
    };
  }, [latestMetrics?.targetTraining, latestMetrics?.trainingDays, trainingActivity]);

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

    const lastWeek = trainingActivity?.lastWeek ?? null;
    const sessionsLogged = lastWeek?.count ?? null;
    const activeDays = lastWeek?.activeDays ?? null;
    const targetFromAi = lastWeek?.aiTarget ?? null;
    const fallbackTarget = latestMetrics.targetTraining ?? activityToTargetDays(latestMetrics.activityLevel);
    const target = targetFromAi ?? fallbackTarget;

    if (sessionsLogged != null || target != null) {
      if (target != null && target > 0 && sessionsLogged != null) {
        const pct = Math.round((sessionsLogged / target) * 100);
        const targetLabel = Number.isInteger(target) ? target.toString() : target.toFixed(1);
        const daySuffix = activeDays != null ? ` · ${activeDays} active day${activeDays === 1 ? '' : 's'}` : '';
        cards.push({
          label: 'Training cadence',
          value: `${sessionsLogged} of ${targetLabel} sessions (${pct}%)${daySuffix}`
        });
      } else if (sessionsLogged != null) {
        const daySuffix = activeDays != null ? ` · ${activeDays} active day${activeDays === 1 ? '' : 's'}` : '';
        cards.push({
          label: 'Training cadence',
          value: `${sessionsLogged} sessions logged this week${daySuffix}`
        });
      } else if (target != null) {
        const targetLabel = Number.isInteger(target) ? target.toString() : target.toFixed(1);
        cards.push({
          label: 'Training cadence',
          value: `Target ${targetLabel} sessions / week`
        });
      }
    }

    if (trainingActivity) {
      cards.push({
        label: '7-day workouts',
        value: `${trainingActivity.trailingSevenDays} workout${trainingActivity.trailingSevenDays === 1 ? '' : 's'}`
      });
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
            {weeklyTrainingSeries && (
            <article className="analytics-panel">
              <header>
                <h2>Weekly training volume</h2>
                <p>Logged sessions against AI recommended cadence.</p>
              </header>
              <div className="analytics-chart">
                <Bar
                  data={weeklyTrainingSeries}
                  options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    scales: {
                      sessions: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        title: { display: true, text: 'Sessions' }
                      },
                      weight: {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Weight (kg)' }
                      }
                    }
                  }}
                />
              </div>
            </article>
          )}
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

          {dailyTrainingSeries && (
            <article className="analytics-panel analytics-panel--wide">
              <header>
                <h2>Daily sessions</h2>
                <p>Past two weeks of workouts compared with AI pacing.</p>
              </header>
              <div className="analytics-chart">
                <Bar
                  data={dailyTrainingSeries}
                  options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    scales: {
                      sessions: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        title: { display: true, text: 'Sessions' }
                      },
                      weight: {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Weight (kg)' }
                      }
                    }
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

          {progressChartSeries && (
            <article className="analytics-panel analytics-panel--wide">
              <header>
                <h2>Progress Overview</h2>
                <p>Combined view of weight trend, wellness score evolution, and activity level changes.</p>
              </header>
              <div className="analytics-chart">
                <Line
                  data={progressChartSeries}
                  options={{
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: {
                          usePointStyle: true,
                          padding: 20
                        }
                      }
                    },
                    scales: {
                      weight: {
                        type: 'linear',
                        position: 'left',
                        title: {
                          display: true,
                          text: 'Weight (kg)'
                        },
                        grid: {
                          drawOnChartArea: false
                        }
                      },
                      wellness: {
                        type: 'linear',
                        position: 'right',
                        title: {
                          display: true,
                          text: 'Wellness Score'
                        },
                        min: 0,
                        max: 100,
                        grid: {
                          drawOnChartArea: false
                        }
                      },
                      activity: {
                        type: 'linear',
                        position: 'right',
                        title: {
                          display: true,
                          text: 'Activity Score'
                        },
                        min: 0,
                        max: 100,
                        grid: {
                          drawOnChartArea: false
                        },
                        ticks: {
                          callback: function(value) {
                            if (value === 20) return 'Sedentary';
                            if (value === 40) return 'Light';
                            if (value === 55) return 'Lightly Active';
                            if (value === 70) return 'Moderate';
                            if (value === 80) return 'Active';
                            if (value === 90) return 'Very Active';
                            if (value === 95) return 'Extra Active';
                            return '';
                          }
                        }
                      }
                    },
                    interaction: {
                      mode: 'index',
                      intersect: false
                    },
                    hover: {
                      mode: 'index',
                      intersect: false
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
                <p>{`Logged ${Number.isInteger(trainingDoughnut.attained) ? trainingDoughnut.attained : trainingDoughnut.attained.toFixed(1)} of ${Number.isInteger(trainingDoughnut.target) ? trainingDoughnut.target : trainingDoughnut.target.toFixed(1)} sessions this week`}</p>
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
            <article className="analytics-panel analytics-panel--wide analytics-panel--radar">
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

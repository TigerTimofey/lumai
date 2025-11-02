import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';

import { db } from '../../../../config/firebase';

interface DashboardStreakWidgetProps {
  uid: string;
}

const normalizeDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'object' && value !== null && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const converted = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (typeof value === 'object' && value !== null) {
    const maybeSeconds = (value as { _seconds?: number; seconds?: number })._seconds ??
      (value as { _seconds?: number; seconds?: number }).seconds;
    if (typeof maybeSeconds === 'number') {
      return new Date(maybeSeconds * 1000);
    }
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  return null;
};

const formatDayKey = (date: Date) => {
  const keyDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return keyDate.toISOString().slice(0, 10);
};

const DashboardStreakWidget: React.FC<DashboardStreakWidgetProps> = ({ uid }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayKeys, setDayKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const workoutsRef = collection(db, 'users', uid, 'workouts');
    const workoutsQuery = query(workoutsRef, orderBy('createdAt', 'desc'), limit(200));
    const unsubscribe = onSnapshot(
      workoutsQuery,
      (snapshot) => {
        const keys = new Set<string>();
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as DocumentData;
          const createdAt = normalizeDate(data.createdAt ?? null);
          if (!createdAt) return;
          keys.add(formatDayKey(createdAt));
        });
        setDayKeys(keys);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load workouts');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [uid]);

  const streakGoal = 7;
  const { currentStreak, bestStreak } = useMemo(() => {
    if (dayKeys.size === 0) {
      return { currentStreak: 0, bestStreak: 0 };
    }

    let consecutive = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const keySet = dayKeys;

    const computeCurrent = () => {
      let count = 0;
      const cursor = new Date(today);
      while (true) {
        const key = formatDayKey(cursor);
        if (keySet.has(key)) {
          count += 1;
          cursor.setDate(cursor.getDate() - 1);
        } else {
          break;
        }
      }
      return count;
    };

    const computeBest = () => {
      let longest = 0;
      let rolling = 0;
      // Collect all keys, sort descending
      const sortedKeys = Array.from(keySet.values()).sort().reverse();
      let lastDate: Date | null = null;
      sortedKeys.forEach((key) => {
        const [year, month, day] = key.split('-').map(Number);
        const currentDate = new Date(year, month - 1, day);
        if (!lastDate) {
          rolling = 1;
        } else {
          const diff = (lastDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);
          if (diff === 1) {
            rolling += 1;
          } else {
            rolling = 1;
          }
        }
        if (rolling > longest) longest = rolling;
        lastDate = currentDate;
      });
      return longest;
    };

    consecutive = computeCurrent();
    const best = computeBest();
    return { currentStreak: consecutive, bestStreak: best };
  }, [dayKeys]);

  const progress = Math.min(currentStreak, streakGoal) / streakGoal;
  const percent = Math.round(progress * 100);

  return (
    <div className="dashboard-widget" aria-labelledby="dashboard-streak-title" aria-busy={loading}>
      <h3 id="dashboard-streak-title" className="dashboard-widget-title">Streak day</h3>
      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 12 }}>
        {loading ? (
          <p>Checking your streak…</p>
        ) : error ? (
          <p role="alert" style={{ color: 'var(--color-error)', margin: 0 }}>{error}</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <strong>Current streak</strong>
                <div style={{ fontSize: '1.6rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                  {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
                </div>
              </div>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-gray-500)' }}>Goal: {streakGoal} days</span>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--color-gray-200)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${percent}%`,
                    height: '100%',
                    background: progress >= 1 ? 'var(--color-success, #10B981)' : 'var(--color-primary)',
                    transition: 'width 0.2s ease'
                  }}
                />
              </div>
              {currentStreak >= streakGoal ? (
                <p style={{ margin: 0, color: 'var(--color-success, #047857)', fontWeight: 600 }}>
                  Amazing! You hit a 7-day streak!
                </p>
              ) : currentStreak === 0 ? (
                <p style={{ margin: 0, color: 'var(--color-gray-600)' }}>
                  Start today to begin your streak.
                </p>
              ) : (
                <p style={{ margin: 0, color: 'var(--color-gray-600)' }}>
                  {streakGoal - currentStreak} {streakGoal - currentStreak === 1 ? 'day' : 'days'} left to reach your streak goal.
                </p>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>
              Best streak: {bestStreak} {bestStreak === 1 ? 'day' : 'days'}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DashboardStreakWidget;

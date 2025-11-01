import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';

import { db } from '../../../../config/firebase';
import LogWorkoutModal from '../../analytics/logout-workout/logout-modal/LogWorkoutModal';
import WorkoutHistoryModal from '../../analytics/history-workout/history-modal/WorkoutHistoryModal';
import type { WorkoutHistoryItem } from '../../analytics/history-workout/WorkoutHistorySwiper';
import './DashboardWorkoutWidget.css';
import { DASHBOARD_LOG_WORKOUT_EVENT } from '../events';

type DaySummary = {
  id: string;
  label: string;
  dateLabel: string;
  count: number;
  workouts: WorkoutHistoryItem[];
};

const normalizeWorkoutDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'object' && value !== null && typeof (value as { toDate?: unknown }).toDate === 'function') {
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

const toNumber = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

interface DashboardWorkoutWidgetProps {
  uid: string;
  registeredAt?: Date | string | null;
}

const DashboardWorkoutWidget: React.FC<DashboardWorkoutWidgetProps> = ({ uid, registeredAt }) => {
  const [workouts, setWorkouts] = useState<WorkoutHistoryItem[]>([]);
  const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [dateInput,] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [historyModalState, setHistoryModalState] = useState<{
    open: boolean;
    id: string | null;
    weekday: string;
    dateLabel: string;
  workouts: WorkoutHistoryItem[];
}>({
  open: false,
  id: null,
  weekday: '',
  dateLabel: '',
  workouts: []
});

  const registrationStart = useMemo(() => {
    if (!registeredAt) return null;
    const base = registeredAt instanceof Date ? registeredAt : new Date(registeredAt);
    if (Number.isNaN(base.getTime())) return null;
    return new Date(base.getFullYear(), base.getMonth(), base.getDate());
  }, [registeredAt]);

  useEffect(() => {
    const handleLogWorkoutEvent = () => {
      setModalOpen(true);
    };
    window.addEventListener(DASHBOARD_LOG_WORKOUT_EVENT, handleLogWorkoutEvent);
    return () => {
      window.removeEventListener(DASHBOARD_LOG_WORKOUT_EVENT, handleLogWorkoutEvent);
    };
  }, []);

  useEffect(() => {
    const workoutsRef = collection(db, 'users', uid, 'workouts');
    const workoutsQuery = query(workoutsRef, orderBy('createdAt', 'desc'), limit(120));
    const unsubscribe = onSnapshot(workoutsQuery, (snapshot) => {
      const items = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        const createdAtRaw = data.createdAt ?? null;
        const createdAtDate = normalizeWorkoutDate(createdAtRaw);
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
      setWorkouts(items);
    });
    return () => unsubscribe();
  }, [uid]);

  const refreshWeight = useCallback(async () => {
    try {
      const latestDoc = await getDoc(doc(db, 'users', uid, 'analytics', 'latest'));
      if (latestDoc.exists()) {
        const data = latestDoc.data() as { weightKg?: unknown };
        const weight = typeof data.weightKg === 'number' ? data.weightKg : null;
        setCurrentWeightKg(weight);
      }
    } catch {
      // ignore weight fetch errors, widget still works without weight
    }
  }, [uid]);

  useEffect(() => {
    void refreshWeight();
  }, [refreshWeight]);

  const daySummaries: DaySummary[] = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
    const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit' });
    const today = new Date();
    const summaries: DaySummary[] = [];
    const workoutsByDay = new Map<string, WorkoutHistoryItem[]>();
    const earliestTime = registrationStart ? registrationStart.getTime() : null;
    const formatKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    workouts.forEach((item) => {
      const createdAt = item.createdAtDate ?? normalizeWorkoutDate(item.createdAt);
      if (!createdAt) return;
      const keyDate = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
      const diffDays = Math.floor((today.getTime() - keyDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0 || diffDays > 13) return; // limit to the past two weeks
      if (earliestTime !== null && keyDate.getTime() < earliestTime) return;
      const key = formatKey(keyDate);
      const bucket = workoutsByDay.get(key) ?? [];
      bucket.push({ ...item, createdAtDate: createdAt });
      workoutsByDay.set(key, bucket);
    });

    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - offset);
      const key = formatKey(day);
      const bucket = (workoutsByDay.get(key) ?? []).slice().sort((a, b) => {
        const aTime = a.createdAtDate ? a.createdAtDate.getTime() : 0;
        const bTime = b.createdAtDate ? b.createdAtDate.getTime() : 0;
        return bTime - aTime;
      });
      summaries.push({
        id: key,
        label: formatter.format(day),
        dateLabel: dateFormatter.format(day),
        count: bucket.length,
        workouts: bucket
      });
    }

    return summaries;
  }, [workouts, registrationStart]);

  const todaysCount = daySummaries[0]?.count ?? 0;

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const update = () => {
      const el = scrollerRef.current;
      if (!el) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setCanScrollLeft(scrollLeft > 2);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
    };

    update();
    node.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    return () => {
      node.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [daySummaries.length]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setCanScrollLeft(scrollLeft > 2);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
    });
    return () => cancelAnimationFrame(raf);
  }, [daySummaries]);

  useEffect(() => {
    if (!historyModalState.open || !historyModalState.id) return;
    const match = daySummaries.find((day) => day.id === historyModalState.id);
    if (!match) return;
    setHistoryModalState((prev) => {
      if (!prev.open || prev.id !== match.id) return prev;
      return {
        ...prev,
        workouts: match.workouts,
        weekday: match.label,
        dateLabel: match.dateLabel
      };
    });
  }, [daySummaries, historyModalState.id, historyModalState.open]);

  return (
    <section className="dashboard-workout-widget" aria-labelledby="dashboard-workout-widget-heading">
      <header className="dashboard-workout-widget__header">
        <div>
          <p className="dashboard-workout-widget__subtitle">Today · {todaysCount} {todaysCount === 1 ? 'workout' : 'workouts'}</p>
          <h2 id="dashboard-workout-widget-heading" className="dashboard-workout-widget__title">Workout history</h2>
        </div>
        <div className="dashboard-workout-widget__controls">
          <button
            type="button"
            className="dashboard-workout-widget__action"
            onClick={() => setModalOpen(true)}
          >
            Log workout
          </button>
        </div>
      </header>
      <div
        className={`dashboard-workout-widget__track${canScrollLeft ? ' dashboard-workout-widget__track--mask-left' : ''}${canScrollRight ? ' dashboard-workout-widget__track--mask-right' : ''}`}
      >
        <div ref={scrollerRef} className="dashboard-workout-widget__scroller" role="list">
          {daySummaries.slice().reverse().map((day) => (
            <article
              key={day.id}
              className={`dashboard-workout-widget__card${day.count > 0 ? ' dashboard-workout-widget__card--active' : ''}`}
              role="listitem"
              tabIndex={0}
              onClick={() => setHistoryModalState({
                open: true,
                id: day.id,
                weekday: day.label,
                dateLabel: day.dateLabel,
                workouts: day.workouts
              })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setHistoryModalState({
                    open: true,
                    id: day.id,
                    weekday: day.label,
                    dateLabel: day.dateLabel,
                    workouts: day.workouts
                  });
                }
              }}
              aria-label={`${day.label} ${day.dateLabel}. ${day.count} ${day.count === 1 ? 'workout' : 'workouts'}. Tap to view details.`}
            >
              <span className="dashboard-workout-widget__day">{day.label}</span>
              <span className="dashboard-workout-widget__date">{day.dateLabel}</span>
              <div className="dashboard-workout-widget__count-block">
                <strong className="dashboard-workout-widget__count">{day.count}</strong>
                <span className="dashboard-workout-widget__count-label">{day.count === 1 ? 'workout' : 'workouts'}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
      <LogWorkoutModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        uid={uid}
        currentWeightKg={currentWeightKg}
        initialDate={dateInput}
        onSaved={() => {
          setModalOpen(false);
          void refreshWeight();
        }}
      />
      <WorkoutHistoryModal
        open={historyModalState.open}
        weekday={historyModalState.weekday}
        dateLabel={historyModalState.dateLabel}
        workouts={historyModalState.workouts}
        onClose={() => setHistoryModalState((prev) => ({ ...prev, open: false, id: null }))}
      />
    </section>
  );
};

export default DashboardWorkoutWidget;

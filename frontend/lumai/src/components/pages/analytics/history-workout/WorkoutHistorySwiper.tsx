import React, { useEffect, useMemo, useRef, useState } from 'react';
import './WorkoutHistorySwiper.css';

export type WorkoutHistoryItem = {
  id?: string;
  createdAt: unknown;
  createdAtDate?: Date | null;
  type?: string | null;
  durationMinutes?: number | null;
  intensity?: string | null;
  notes?: string | null;
  weightKg?: number | null;
};

const parseDateInput = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

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

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

const normalizeDate = (value: unknown): Date | null => {
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

const formatKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

interface WorkoutHistorySwiperProps {
  workouts: WorkoutHistoryItem[];
  userCreationTime?: string | null;
  profileCreationTime?: string | number | Date | null;
  onSelectDay?: (payload: {
    id: string;
    date: Date;
    workouts: WorkoutHistoryItem[];
    weekday: string;
    dateLabel: string;
  }) => void;
  selectedDayKey?: string | null;
}

const WorkoutHistorySwiper: React.FC<WorkoutHistorySwiperProps> = ({
  workouts,
  userCreationTime,
  profileCreationTime,
  onSelectDay,
  selectedDayKey
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasAutoCentered, setHasAutoCentered] = useState(false);

  const todayKey = useMemo(() => {
    const now = new Date();
    const normalized = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return formatKey(normalized);
  }, []);

  const dayEntries = useMemo(() => {
    const today = new Date();
    const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const registrationDate = (() => {
      const profileParsed = parseDateInput(profileCreationTime);
      const userParsed = parseDateInput(userCreationTime);
      const candidate = profileParsed ?? userParsed;
      if (!candidate) return null;
      return new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
    })();

    const maxPastDays = 180;
    const minAllowedStart = new Date(normalizedToday);
    minAllowedStart.setDate(minAllowedStart.getDate() - maxPastDays);

    let startDate = normalizedToday;
    if (registrationDate && registrationDate <= normalizedToday) {
      startDate = registrationDate < minAllowedStart ? minAllowedStart : registrationDate;
    }

    const endDate = new Date(startDate);
    endDate.setTime(normalizedToday.getTime());
    endDate.setMonth(endDate.getMonth() + 2);
    endDate.setDate(endDate.getDate() + 1);
    endDate.setHours(23, 59, 59, 999);

    const workoutsByDay = new Map<string, WorkoutHistoryItem[]>();

    workouts.forEach((workout) => {
      const createdAt = workout.createdAtDate ?? normalizeDate(workout.createdAt);
      if (!createdAt) return;
      if (createdAt < startDate || createdAt > endDate) return;
      const day = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
      const key = formatKey(day);
      const existing = workoutsByDay.get(key) ?? [];
      existing.push({
        ...workout,
        createdAtDate: createdAt
      });
      workoutsByDay.set(key, existing);
    });

    const weekFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
    const dateFormatter = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });

    const days: Array<{
      id: string;
      date: Date;
      weekday: string;
      dateLabel: string;
      count: number;
      workouts: WorkoutHistoryItem[];
    }> = [];

    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const dayDate = new Date(cursor);
      const key = formatKey(dayDate);
      const dailyWorkouts = (workoutsByDay.get(key) ?? [])
        .slice()
        .sort((a, b) => {
          const aTime = a.createdAtDate ? a.createdAtDate.getTime() : 0;
          const bTime = b.createdAtDate ? b.createdAtDate.getTime() : 0;
          return bTime - aTime;
        });

      days.push({
        id: key,
        date: dayDate,
        weekday: weekFormatter.format(dayDate),
        dateLabel: dateFormatter.format(dayDate),
        count: dailyWorkouts.length,
        workouts: dailyWorkouts
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    return days;
  }, [profileCreationTime, userCreationTime, workouts]);

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
  }, [dayEntries.length]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setCanScrollLeft(scrollLeft > 2);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
    });
    return () => cancelAnimationFrame(raf);
  }, [dayEntries]);

  useEffect(() => {
    if (hasAutoCentered) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const todayElement = scroller.querySelector<HTMLElement>(`[data-day="${todayKey}"]`);
    if (!todayElement) return;
    todayElement.scrollIntoView({ behavior: 'auto', inline: 'start', block: 'nearest' });
    setHasAutoCentered(true);
  }, [dayEntries, hasAutoCentered, todayKey]);

  return (
    <section className="workout-history">
      <div
        className={`workout-history__container${canScrollLeft ? ' workout-history__container--mask-left' : ''}${canScrollRight ? ' workout-history__container--mask-right' : ''}`}
      >
        <header className="workout-history__header">
          <h2>Workout history</h2>
          <p>Tracking today forward (swipe back for past days).</p>
        </header>
        <div
          ref={scrollerRef}
          className="workout-history__scroller"
          role="list"
        >
          {dayEntries.map((day) => (
            <article
              key={day.id}
              className={`workout-history__card${day.count > 0 ? ' workout-history__card--active' : ''}${selectedDayKey === day.id ? ' workout-history__card--selected' : ''}`}
              role="listitem"
              data-day={day.id}
              tabIndex={0}
              aria-label={`${day.weekday} ${day.dateLabel}. ${day.count} ${day.count === 1 ? 'workout' : 'workouts'}`}
              onClick={() => onSelectDay?.({
                id: day.id,
                date: day.date,
                workouts: day.workouts,
                weekday: day.weekday,
                dateLabel: day.dateLabel
              })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectDay?.({
                    id: day.id,
                    date: day.date,
                    workouts: day.workouts,
                    weekday: day.weekday,
                    dateLabel: day.dateLabel
                  });
                }
              }}
            >
              <span className="workout-history__weekday">{day.weekday}</span>
              <span className="workout-history__date">{day.dateLabel}</span>
              <span className="workout-history__count">
                {day.count} {day.count === 1 ? 'workout' : 'workouts'}
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WorkoutHistorySwiper;

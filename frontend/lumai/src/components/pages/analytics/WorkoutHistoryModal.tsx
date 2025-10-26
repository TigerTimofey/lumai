import React, { useEffect } from 'react';
import type { WorkoutHistoryItem } from './WorkoutHistorySwiper';
import './WorkoutHistoryModal.css';

interface WorkoutHistoryModalProps {
  open: boolean;
  weekday: string;
  dateLabel: string;
  workouts: WorkoutHistoryItem[];
  onClose: () => void;
}

const formatTime = (date: Date | null | undefined) => {
  if (!date) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return null;
  return `${Math.round(value)} min`;
};

const WorkoutHistoryModal: React.FC<WorkoutHistoryModalProps> = ({
  open,
  weekday,
  dateLabel,
  workouts,
  onClose
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const hasWorkouts = workouts.length > 0;

  return (
    <div className="workout-history-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        className="workout-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-history-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="workout-history-modal__header">
          <div>
            <p className="workout-history-modal__weekday">{weekday}</p>
            <h2 id="workout-history-modal-title" className="workout-history-modal__title">{dateLabel}</h2>
          </div>
          <button type="button" className="workout-history-modal__close" onClick={onClose} aria-label="Close workout history">
            &times;
          </button>
        </header>

        {hasWorkouts ? (
          <ul className="workout-history-modal__list">
            {workouts.map((workout, index) => {
              const key = workout.id ?? `${workout.createdAt ?? 'entry'}-${index}`;
              const time = formatTime(workout.createdAtDate);
              const durationLabel = formatDuration(workout.durationMinutes);
              const intensityLabel = workout.intensity ? workout.intensity.replace(/_/g, ' ') : null;
              const weightLabel = workout.weightKg != null ? `${workout.weightKg} kg` : null;

              return (
                <li key={key} className="workout-history-modal__item">
                  <div className="workout-history-modal__meta">
                    <span className="workout-history-modal__time">{time}</span>
                    <span className="workout-history-modal__type">{(workout.type ?? 'Workout').replace(/_/g, ' ')}</span>
                  </div>
                  <div className="workout-history-modal__details">
                    {durationLabel && <span>{durationLabel}</span>}
                    {intensityLabel && <span>Intensity: {intensityLabel}</span>}
                    {weightLabel && <span>Weight: {weightLabel}</span>}
                  </div>
                  {workout.notes && (
                    <p className="workout-history-modal__notes">{workout.notes}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="workout-history-modal__empty">No workouts logged for this day yet.</p>
        )}
      </div>
    </div>
  );
};

export default WorkoutHistoryModal;

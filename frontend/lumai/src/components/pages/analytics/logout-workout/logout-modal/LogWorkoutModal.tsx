import React, { useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../../../../config/firebase';
import './LogWorkoutModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  uid: string;
  onSaved?: () => void;
  currentWeightKg?: number | null;
  initialDate?: string | Date | null;
}

const parseInitialDate = (value?: string | Date | null) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
};

const LogWorkoutModal: React.FC<Props> = ({ open, onClose, uid, onSaved, currentWeightKg, initialDate }) => {
  const [type, setType] = useState('workout');
  const [duration, setDuration] = useState<string>('');
  const [intensity, setIntensity] = useState<'low' | 'medium' | 'high' | ''>('');
  const [notes, setNotes] = useState('');
  const [weightInput, setWeightInput] = useState<string>('');
  const [dateInput, setDateInput] = useState<string>(() => parseInitialDate(initialDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setType('workout');
    setDuration('');
    setIntensity('');
    setNotes('');
    setWeightInput('');
    setDateInput(parseInitialDate(initialDate));
    setError(null);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const dur = duration === '' ? null : Number(duration);
      const weightVal = weightInput === '' ? null : Number(weightInput);
      const finalWeight = weightVal != null && Number.isFinite(weightVal) ? weightVal : null;
      const chosenDate = dateInput ? new Date(dateInput) : new Date();
      const isValidDate = !Number.isNaN(chosenDate.getTime());
      if (isValidDate) {
        chosenDate.setHours(12, 0, 0, 0);
      }
      const createdAtValue = isValidDate ? chosenDate : serverTimestamp();
      const payload: Record<string, unknown> = {
        type,
        durationMinutes: dur != null && Number.isFinite(dur) ? dur : null,
        intensity: intensity || null,
        notes: notes || null,
        createdAt: createdAtValue,
        weightKg: finalWeight
      };
      const writes: Array<Promise<unknown>> = [
        addDoc(collection(db, 'users', uid, 'workouts'), payload)
      ];
      if (finalWeight != null) {
        writes.push(
          setDoc(
            doc(db, 'users', uid, 'analytics', 'latest'),
            {
              weightKg: finalWeight,
              weightUpdatedAt: serverTimestamp()
            },
            { merge: true }
          )
        );
        writes.push(
          setDoc(
            doc(db, 'users', uid),
            {
              requiredProfile: {
                weight: finalWeight,
                weightUpdatedAt: serverTimestamp()
              }
            },
            { merge: true }
          )
        );
      }
      await Promise.all(writes);
      setSaving(false);
      reset();
      onSaved?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to save workout');
      setSaving(false);
    }
  };

  return (
    <div className="log-workout-modal" role="dialog" aria-modal="true">
      <form className="log-workout-form" onSubmit={handleSubmit}>
        <h3>Log workout</h3>
        <label>
          Date
          <input
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
          />
        </label>

        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="workout">Workout</option>
            <option value="run">Run</option>
            <option value="cycle">Cycle</option>
            <option value="yoga">Yoga</option>
            <option value="strength">Strength</option>
          </select>
        </label>

        <label>
          Duration (minutes)
          <input
            type="number"
            min={0}
            max={1440}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>

        <label>
          Intensity
          <select value={intensity} onChange={(e) => setIntensity(e.target.value as 'low' | 'medium' | 'high' | '')}>
            <option value="">(not specified)</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <label className="log-workout-weight-toggle">
          Weight (kg)
          <input
            type="number"
            min={30}
            max={300}
            placeholder={currentWeightKg ? String(currentWeightKg) : 'kg'}
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            className="log-workout-weight-input"
          />
          <span className="log-workout-weight-hint">Leave blank to keep the previous weight.</span>
        </label>

        {error && <p className="log-workout-error">{error}</p>}

        <div className="log-workout-actions">
          <button type="button" className="log-workout-cancel" onClick={handleClose} disabled={saving}>Cancel</button>
          <button type="submit" className="log-workout-save" disabled={saving}>{saving ? 'Saving…' : 'Save workout'}</button>
        </div>
      </form>
    </div>
  );
};

export default LogWorkoutModal;

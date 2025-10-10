import React, { useEffect, useMemo, useState } from 'react';
import '../../auth/AuthPage.css';

import { db } from '../../../config/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { RequiredProfile, AdditionalProfile, FirestoreUser } from './profileOptions/types';

import './ProfileEditor.css';

import {
  ACTIVITY_LEVELS,
  FITNESS_GOALS,
  GENDERS,
  OCCUPATIONS,
  DIET_PREFS,
  DIET_RESTR,
  EXERCISE_TYPES,
  FITNESS_LEVELS,
  ENVIRONMENTS,
  SESSION_DURATIONS,
  DAY_TIMES
} from './profileOptions/profileOptions';

function fmtLabel(s: string) {
  return s.replace(/_/g, ' ');
}

type Props = {
  uid: string;
  mode: 'required' | 'bonus';
  setMode: (mode: 'required' | 'bonus') => void;
};

// Removed duplicate ProfileEditor declaration
const ProfileEditor: React.FC<Props> = ({ uid, mode, setMode }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [required, setRequired] = useState<RequiredProfile>({
    activityLevel: null,
    age: null,
    fitnessGoal: null,
    gender: null,
    height: null,
    weight: null,
  });

  const [bonus, setBonus] = useState<AdditionalProfile>({
    desiredActivityLevel: null,
    dietaryPreferences: null,
    dietaryRestrictions: null,
    endurance: null,
    exerciseTypes: null,
    fitnessLevel: null,
    occupationType: null,
    preferredEnvironment: null,
    preferredTimeOfDay: null,
    sessionDuration: null,
    strengthMetrics: { pushUps: null, squats: null, trainingDaysPerWeek: null },
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data() as FirestoreUser;
          const r = (data?.requiredProfile ?? {}) as Partial<RequiredProfile>;
          const a = (data?.additionalProfile ?? {}) as Partial<AdditionalProfile>;
          setRequired((prev) => ({
            activityLevel: r.activityLevel ?? prev.activityLevel,
            age: r.age != null ? Number(r.age) : prev.age,
            fitnessGoal: r.fitnessGoal ?? prev.fitnessGoal,
            gender: r.gender ?? prev.gender,
            height: r.height != null ? Number(r.height) : prev.height,
            weight: r.weight != null ? Number(r.weight) : prev.weight,
          }));
          setBonus((prev) => ({
            desiredActivityLevel: a.desiredActivityLevel ?? prev.desiredActivityLevel,
            dietaryPreferences: a.dietaryPreferences ?? prev.dietaryPreferences,
            dietaryRestrictions: a.dietaryRestrictions ?? prev.dietaryRestrictions,
            endurance: a.endurance != null ? Number(a.endurance) : prev.endurance,
            exerciseTypes: a.exerciseTypes ?? prev.exerciseTypes,
            fitnessLevel: a.fitnessLevel ?? prev.fitnessLevel,
            occupationType: a.occupationType ?? prev.occupationType,
            preferredEnvironment: a.preferredEnvironment ?? prev.preferredEnvironment,
            preferredTimeOfDay: a.preferredTimeOfDay ?? prev.preferredTimeOfDay,
            sessionDuration: a.sessionDuration ?? prev.sessionDuration,
            strengthMetrics: {
              pushUps: a?.strengthMetrics?.pushUps != null ? Number(a.strengthMetrics.pushUps) : prev.strengthMetrics.pushUps,
              squats: a?.strengthMetrics?.squats != null ? Number(a.strengthMetrics.squats) : prev.strengthMetrics.squats,
              trainingDaysPerWeek: a?.strengthMetrics?.trainingDaysPerWeek != null ? Number(a.strengthMetrics.trainingDaysPerWeek) : prev.strengthMetrics.trainingDaysPerWeek,
            },
          }));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [uid]);

  const canSaveRequired = useMemo(() => {
    return Boolean(
      required.activityLevel &&
      required.age != null &&
      required.fitnessGoal &&
      required.gender &&
      required.height != null &&
      required.weight != null
    );
  }, [required]);

  const onChangeReq = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRequired((prev) => ({
      ...prev,
      [name]: ['age', 'height', 'weight'].includes(name) ? (value === '' ? null : Number(value)) : (value || null),
    }));
  };

  const onChangeBonus = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('strength.')) {
      const key = name.split('.')[1] as 'pushUps' | 'squats' | 'trainingDaysPerWeek';
      setBonus((prev) => ({
        ...prev,
        strengthMetrics: { ...prev.strengthMetrics, [key]: value === '' ? null : Number(value) },
      }));
      return;
    }
    setBonus((prev) => ({
      ...prev,
      [name]: ['endurance'].includes(name) ? (value === '' ? null : Number(value)) : (value || null),
    }) as AdditionalProfile);
  };



  const save = async () => {
    setError(null);
    try {
      await setDoc(doc(db, 'users', uid), {
        requiredProfile: required,
        additionalProfile: bonus,
        profileCompleted: canSaveRequired,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="dashboard-widget" aria-labelledby="profile-editor-title">
      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        <div className="auth-tabs" role="tablist" aria-label="Profile editor tabs">
          <div className={`auth-toggle-thumb ${mode === 'bonus' ? 'right' : 'left'}`} aria-hidden />
          <button
            type="button"
            role="tab"
            className={`auth-tab ${mode === 'required' ? 'active' : ''}`}
            aria-selected={mode === 'required'}
            onClick={() => setMode('required')}
          >
            Required
          </button>
          <button
            type="button"
            role="tab"
            className={`auth-tab ${mode === 'bonus' ? 'active' : ''}`}
            aria-selected={mode === 'bonus'}
            onClick={() => setMode('bonus')}
          >
            Extra
          </button>
        </div>
      </div>
      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 12 }}>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            {error && <p className="security-message">{error}</p>}
            {mode === 'required' ? (
              <div className="profile-editor-grid">
                <label className="form-field">
                  <span className="form-label">Activity level</span><br />
                  <select name="activityLevel" value={required.activityLevel ?? ''} onChange={onChangeReq} className='profile-editor-input'>
                    <option value="">Select activity level…</option>
                    {ACTIVITY_LEVELS.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-label">Fitness goal</span><br />
                  <select name="fitnessGoal" value={required.fitnessGoal ?? ''} onChange={onChangeReq} className='profile-editor-input'>
                    <option value="">Select fitness goal…</option>
                    {FITNESS_GOALS.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-label">Gender</span><br />
                  <select name="gender" value={required.gender ?? ''} onChange={onChangeReq} className='profile-editor-input'>
                    <option value="">Select gender…</option>
                    {GENDERS.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-label">Age</span><br />
                  <input name="age" type="number" min={13} max={120} value={required.age ?? ''} onChange={onChangeReq} className='profile-editor-input' placeholder="Enter your age" />
                </label>
                <label className="form-field">
                  <span className="form-label">Height (cm)</span><br />
                  <input name="height" type="number" min={50} max={300} value={required.height ?? ''} onChange={onChangeReq} className='profile-editor-input' placeholder="Your height in cm" />
                </label>
                <label className="form-field">
                  <span className="form-label">Weight (kg)</span><br />
                  <input name="weight" type="number" min={20} max={400} value={required.weight ?? ''} onChange={onChangeReq} className='profile-editor-input' placeholder="Your weight in kg" />
                </label>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginTop: 8 }}>
                 <label className="form-field">
                   <span className="form-label">Desired activity level</span><br />
                   <select name="desiredActivityLevel" value={bonus.desiredActivityLevel ?? ''} onChange={onChangeBonus} className='profile-editor-input'>
                     <option value="">Select desired activity…</option>
                     {ACTIVITY_LEVELS.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                   </select>
                 </label>
                 <label className="form-field">
                   <span className="form-label">Dietary preferences</span><br />
                   <select name="dietaryPreferences" value={bonus.dietaryPreferences?.[0] ?? ''} onChange={onChangeBonus} className='profile-editor-input'>
                     <option value="">Select preference…</option>
                     {DIET_PREFS.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                   </select>
                 </label>
                 <label className="form-field">
                   <span className="form-label">Dietary restrictions</span><br />
                   <select name="dietaryRestrictions" value={bonus.dietaryRestrictions?.[0] ?? ''} onChange={onChangeBonus} className='profile-editor-input'>
                     <option value="">Select restriction…</option>
                     {DIET_RESTR.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                   </select>
                 </label>
                 <label className="form-field">
                   <span className="form-label">Endurance (minutes)</span><br />
                   <input name="endurance" type="number" min={0} max={240} value={bonus.endurance ?? ''} onChange={onChangeBonus} className='profile-editor-input' placeholder="Minutes" />
                 </label>
                 <label className="form-field">
                   <span className="form-label">Exercise types</span><br />
                   <select name="exerciseTypes" value={bonus.exerciseTypes?.[0] ?? ''} onChange={onChangeBonus} className='profile-editor-input'>
                     <option value="">Select exercise…</option>
                     {EXERCISE_TYPES.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                   </select>
                 </label>
                 <label className="form-field">
                   <span className="form-label">Fitness level</span><br />
                   <select name="fitnessLevel" value={bonus.fitnessLevel ?? ''} onChange={onChangeBonus} className='profile-editor-input'>
                     <option value="">Select fitness level…</option>
                     {FITNESS_LEVELS.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                   </select>
                 </label>
                 <label className="form-field">
                   <span className="form-label">Occupation type</span><br />
                   <select name="occupationType" value={bonus.occupationType ?? ''} onChange={onChangeBonus} className='profile-editor-input'>
                     <option value="">Select occupation…</option>
                     {OCCUPATIONS.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                   </select>
                 </label>
                 <label className="form-field">
                   <span className="form-label">Preferred environment</span><br />
                   <select name="preferredEnvironment" value={bonus.preferredEnvironment ?? ''} onChange={onChangeBonus} className='profile-editor-input'>
                     <option value="">Select environment…</option>
                     {ENVIRONMENTS.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                   </select>
                 </label>
                 <label className="form-field">
                   <span className="form-label">Preferred time of day</span><br />
                   <select name="preferredTimeOfDay" value={bonus.preferredTimeOfDay ?? ''} onChange={onChangeBonus} className='profile-editor-input'>
                     <option value="">Select time…</option>
                     {DAY_TIMES.map((v: string) => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                   </select>
                 </label>
                 <label className="form-field">
                   <span className="form-label">Session duration</span><br />
                   <select name="sessionDuration" value={bonus.sessionDuration ?? ''} onChange={onChangeBonus} className='profile-editor-input'>
                     <option value="">Select duration…</option>
                     {SESSION_DURATIONS.map((v: string) => <option key={v} value={v}>{v}</option>)}
                   </select>
                 </label>
                <fieldset style={{ border: '1px dashed var(--color-gray-200)', borderRadius: 12, padding: 12 }}>
                  <legend style={{ color: 'var(--color-gray-600)', fontSize: 13 }}>Strength metrics</legend>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                     <label className="form-field">
                       <span className="form-label">Push-ups</span><br />
                       <input name="strength.pushUps" type="number" min={0} value={bonus.strengthMetrics.pushUps ?? ''} onChange={onChangeBonus} className='profile-editor-input' placeholder="Count" />
                     </label>
                     <label className="form-field">
                       <span className="form-label">Squats</span><br />
                       <input name="strength.squats" type="number" min={0} value={bonus.strengthMetrics.squats ?? ''} onChange={onChangeBonus} className='profile-editor-input' placeholder="Count" />
                     </label>
                     <label className="form-field">
                       <span className="form-label">Training days/week</span><br />
                       <input name="strength.trainingDaysPerWeek" type="number" min={0} max={7} value={bonus.strengthMetrics.trainingDaysPerWeek ?? ''} onChange={onChangeBonus} className='profile-editor-input' placeholder="0-7" />
                     </label>
                  </div>
                </fieldset>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              {mode === 'required' ? (
                <button
                  type="button"
                  className="dashboard-hero-action"
                  onClick={save}
                  disabled={!canSaveRequired}
                >
                  Update profile
                </button>
              ) : (
                <button
                  type="button"
                  className="dashboard-hero-action"
                  onClick={save}
                >
                   Update profile
                </button>
              )}
              {savedAt && <span style={{ color: 'var(--color-gray-600)', fontSize: 12 }}>Saved {new Date(savedAt).toLocaleTimeString()}</span>}
            </div>
            {mode === 'required' && !canSaveRequired && (
              <p style={{ color: 'var(--color-gray-600)', fontSize: 12 }}>Fill all required fields to update your profile.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default ProfileEditor;

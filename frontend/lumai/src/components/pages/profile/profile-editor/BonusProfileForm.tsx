import React from 'react';

import {
  ACTIVITY_LEVELS,
  DAY_TIMES,
  DIET_PREFS,
  DIET_RESTR,
  ENVIRONMENTS,
  EXERCISE_TYPES,
  FITNESS_LEVELS,
  OCCUPATIONS,
  SESSION_DURATIONS
} from '../profileOptions/profileOptions';
import type { AdditionalProfile } from '../profileOptions/types';
import { fmtLabel } from './utils';

interface BonusProfileFormProps {
  value: AdditionalProfile;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

const BonusProfileForm: React.FC<BonusProfileFormProps> = ({ value, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginTop: 8 }}>
    <label className="form-field">
      <span className="form-label">Desired activity level</span><br />
      <select name="desiredActivityLevel" value={value.desiredActivityLevel ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select desired activity…</option>
        {ACTIVITY_LEVELS.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Dietary preferences</span><br />
      <select name="dietaryPreferences" value={value.dietaryPreferences?.[0] ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select preference…</option>
        {DIET_PREFS.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Dietary restrictions</span><br />
      <select name="dietaryRestrictions" value={value.dietaryRestrictions?.[0] ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select restriction…</option>
        {DIET_RESTR.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Endurance (minutes)</span><br />
      <input
        name="endurance"
        type="number"
        min={0}
        max={240}
        value={value.endurance ?? ''}
        onChange={onChange}
        className="profile-editor-input"
        placeholder="Minutes"
      />
    </label>
    <label className="form-field">
      <span className="form-label">Exercise types</span><br />
      <select name="exerciseTypes" value={value.exerciseTypes?.[0] ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select exercise…</option>
        {EXERCISE_TYPES.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Fitness level</span><br />
      <select name="fitnessLevel" value={value.fitnessLevel ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select fitness level…</option>
        {FITNESS_LEVELS.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Occupation type</span><br />
      <select name="occupationType" value={value.occupationType ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select occupation…</option>
        {OCCUPATIONS.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Preferred environment</span><br />
      <select name="preferredEnvironment" value={value.preferredEnvironment ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select environment…</option>
        {ENVIRONMENTS.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Preferred time of day</span><br />
      <select name="preferredTimeOfDay" value={value.preferredTimeOfDay ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select time…</option>
        {DAY_TIMES.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Session duration</span><br />
      <select name="sessionDuration" value={value.sessionDuration ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select duration…</option>
        {SESSION_DURATIONS.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
    <fieldset style={{ border: '1px dashed var(--color-gray-200)', borderRadius: 12, padding: 12 }}>
      <legend style={{ color: 'var(--color-gray-600)', fontSize: 13 }}>Strength metrics</legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <label className="form-field">
          <span className="form-label">Push-ups</span><br />
          <input
            name="strength.pushUps"
            type="number"
            min={0}
            value={value.strengthMetrics.pushUps ?? ''}
            onChange={onChange}
            className="profile-editor-input"
            placeholder="Count"
          />
        </label>
        <label className="form-field">
          <span className="form-label">Squats</span><br />
          <input
            name="strength.squats"
            type="number"
            min={0}
            value={value.strengthMetrics.squats ?? ''}
            onChange={onChange}
            className="profile-editor-input"
            placeholder="Count"
          />
        </label>
        <label className="form-field">
          <span className="form-label">Training days/week</span><br />
          <input
            name="strength.trainingDaysPerWeek"
            type="number"
            min={0}
            max={7}
            value={value.strengthMetrics.trainingDaysPerWeek ?? ''}
            onChange={onChange}
            className="profile-editor-input"
            placeholder="0-7"
          />
        </label>
      </div>
    </fieldset>
  </div>
);

export default BonusProfileForm;

import React from 'react';

import {
  ACTIVITY_LEVELS,
  FITNESS_GOALS,
  GENDERS
} from '../profileOptions/profileOptions';
import type { RequiredProfile } from '../profileOptions/types';
import { fmtLabel } from './utils';

interface RequiredProfileFormProps {
  value: RequiredProfile;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

const RequiredProfileForm: React.FC<RequiredProfileFormProps> = ({ value, onChange }) => (
  <div className="profile-editor-grid">
    <label className="form-field">
      <span className="form-label">Activity level</span><br />
      <select name="activityLevel" value={value.activityLevel ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select activity level…</option>
        {ACTIVITY_LEVELS.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Fitness goal</span><br />
      <select name="fitnessGoal" value={value.fitnessGoal ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select fitness goal…</option>
        {FITNESS_GOALS.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Gender</span><br />
      <select name="gender" value={value.gender ?? ''} onChange={onChange} className="profile-editor-input">
        <option value="">Select gender…</option>
        {GENDERS.map((option) => (
          <option key={option} value={option}>{fmtLabel(option)}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span className="form-label">Age</span><br />
      <input
        name="age"
        type="number"
        min={13}
        max={120}
        value={value.age ?? ''}
        onChange={onChange}
        className="profile-editor-input"
        placeholder="Enter your age"
      />
    </label>
    <label className="form-field">
      <span className="form-label">Height (cm)</span><br />
      <input
        name="height"
        type="number"
        min={50}
        max={300}
        value={value.height ?? ''}
        onChange={onChange}
        className="profile-editor-input"
        placeholder="Your height in cm"
      />
    </label>
    <label className="form-field">
      <span className="form-label">Weight (kg)</span><br />
      <input
        name="weight"
        type="number"
        min={20}
        max={400}
        value={value.weight ?? ''}
        onChange={onChange}
        className="profile-editor-input"
        placeholder="Your weight in kg"
      />
    </label>
  </div>
);

export default RequiredProfileForm;

import React from 'react';
import type { ProfileCardRowData } from './types';

interface ProfileCardRowProps {
  row: ProfileCardRowData;
}

const ProfileCardRow: React.FC<ProfileCardRowProps> = ({ row }) => (
  <div className="profile-card-row">
    <span className="profile-card-label">
      {typeof row.completed === 'boolean' && (
        <span
          className={`profile-card-check ${row.completed ? 'profile-card-check-complete' : 'profile-card-check-missing'}`}
          title={row.completed ? 'Provided' : 'Missing'}
          aria-hidden="true"
        >
          {row.completed ? '\u2713' : '\u2717'}
        </span>
      )}
      <span className="profile-card-label-text">{row.label}</span>
    </span>
    <span className="profile-card-value">{row.value}</span>
  </div>
);

export default ProfileCardRow;

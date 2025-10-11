import React from 'react';
import type { ProfileCardHeaderField } from './types';

interface ProfileCardHeaderProps {
  fields: ProfileCardHeaderField[];
}

const ProfileCardHeader: React.FC<ProfileCardHeaderProps> = ({ fields }) => (
  <div className="profile-editor-card-info">
    {fields.map((field) => (
      <div key={field.label}>
        <strong>{field.label}:</strong> {field.value}
      </div>
    ))}
  </div>
);

export default ProfileCardHeader;

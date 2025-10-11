import React from 'react';
import ProfileCardRow from './ProfileCardRow';
import type { ProfileCardSectionData } from './types';

interface ProfileCardSectionProps {
  section: ProfileCardSectionData;
}

const ProfileCardSection: React.FC<ProfileCardSectionProps> = ({ section }) => (
  <div className="profile-editor-card-info">
    <div><strong>{section.title}</strong></div>
    {section.rows.map((row) => (
      <ProfileCardRow key={row.label} row={row} />
    ))}
  </div>
);

export default ProfileCardSection;

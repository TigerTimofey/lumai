import React from 'react';
import './ProfileEditor.css';

import ProfileCardHeader from './profile-card/ProfileCardHeader';
import ProfileCardSection from './profile-card/ProfileCardSection';
import ProfileCardState from './profile-card/ProfileCardState';
import { useProfileCardData } from './profile-card/useProfileCardData';
import type { ProfileSummary } from './profileOptions/types';

interface ProfileCardProps {
  loading: boolean;
  error: string | null;
  profile: ProfileSummary | null;
  user: {
    uid: string;
    displayName: string | null;
    email: string | null;
    emailVerified: boolean | null;
    metadata?: { creationTime?: string | null };
  };
  createdAtText: string;
  mode: 'required' | 'bonus';
}

const ProfileCard: React.FC<ProfileCardProps> = ({
  loading,
  error,
  profile,
  user,
  createdAtText,
  mode
}) => {
  const { loading: cardLoading, error: cardError, headerFields, sections } = useProfileCardData({
    user: {
      uid: user.uid,
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      emailVerified: user.emailVerified ?? null
    },
    profile,
    loading,
    error,
    createdAtText
  });

  if (cardLoading) {
    return <ProfileCardState variant="loading" message="Loading…" />;
  }

  if (cardError) {
    return <ProfileCardState variant="error" message={cardError} />;
  }

  const activeSection = mode === 'required' ? sections.required : sections.bonus;

  return (
    <section className="profile-editor-container">
      <h3 className="profile-editor-title">Profile card</h3>
      <div className="profile-editor-body">
        <ProfileCardHeader fields={headerFields} />
        <hr className="profile-editor-divider" />
        <ProfileCardSection section={activeSection} />
      </div>
    </section>
  );
};

export default ProfileCard;

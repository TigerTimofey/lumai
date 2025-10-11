import React from 'react';

interface ProfileCardStateProps {
  variant: 'loading' | 'error';
  message: string;
  title?: string;
}

const ProfileCardState: React.FC<ProfileCardStateProps> = ({ variant, message, title = 'Profile card' }) => (
  <section className="profile-editor-container">
    <h3 className="profile-editor-title">{title}</h3>
    <div className="profile-editor-body">
      {variant === 'error' ? (
        <p className="profile-editor-error">{message}</p>
      ) : (
        <p>{message}</p>
      )}
    </div>
  </section>
);

export default ProfileCardState;

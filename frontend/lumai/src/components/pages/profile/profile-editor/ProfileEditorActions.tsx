import React from 'react';

interface ProfileEditorActionsProps {
  mode: 'required' | 'bonus';
  canSaveRequired: boolean;
  onSave: () => void;
  savedAt: number | null;
}

const ProfileEditorActions: React.FC<ProfileEditorActionsProps> = ({ mode, canSaveRequired, onSave, savedAt }) => (
  <>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
      <button
        type="button"
        className="dashboard-hero-action"
        onClick={onSave}
        disabled={mode === 'required' ? !canSaveRequired : false}
      >
        Update profile
      </button>
      {savedAt && (
        <span style={{ color: 'var(--color-gray-600)', fontSize: 12 }}>
          Saved {new Date(savedAt).toLocaleTimeString()}
        </span>
      )}
    </div>
    {mode === 'required' && !canSaveRequired && (
      <p style={{ color: 'var(--color-gray-600)', fontSize: 12 }}>
        Fill all required fields to update your profile.
      </p>
    )}
  </>
);

export default ProfileEditorActions;

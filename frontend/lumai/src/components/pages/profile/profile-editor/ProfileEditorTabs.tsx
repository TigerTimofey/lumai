import React from 'react';

interface ProfileEditorTabsProps {
  mode: 'required' | 'bonus';
  setMode: React.Dispatch<React.SetStateAction<'required' | 'bonus'>>;
}

const ProfileEditorTabs: React.FC<ProfileEditorTabsProps> = ({ mode, setMode }) => (
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
);

export default ProfileEditorTabs;

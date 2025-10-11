import React from 'react';
import '../../auth/AuthPage.css';

import './ProfileEditor.css';

import BonusProfileForm from './profile-editor/BonusProfileForm';
import ProfileEditorActions from './profile-editor/ProfileEditorActions';
import ProfileEditorTabs from './profile-editor/ProfileEditorTabs';
import { useProfileEditorState } from './profile-editor/useProfileEditorState';
import RequiredProfileForm from './profile-editor/RequiredProfileForm';

type Props = {
  uid: string;
  mode: 'required' | 'bonus';
  setMode: React.Dispatch<React.SetStateAction<'required' | 'bonus'>>;
};

const ProfileEditor: React.FC<Props> = ({ uid, mode, setMode }) => {
  const {
    loading,
    error,
    savedAt,
    required,
    bonus,
    canSaveRequired,
    onChangeRequired,
    onChangeBonus,
    save
  } = useProfileEditorState({ uid });

  return (
    <section className="dashboard-widget" aria-labelledby="profile-editor-title">
      <ProfileEditorTabs mode={mode} setMode={setMode} />
      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 12 }}>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            {error && <p className="security-message">{error}</p>}
            {mode === 'required' ? (
              <RequiredProfileForm value={required} onChange={onChangeRequired} />
            ) : (
              <BonusProfileForm value={bonus} onChange={onChangeBonus} />
            )}
            <ProfileEditorActions
              mode={mode}
              canSaveRequired={canSaveRequired}
              onSave={save}
              savedAt={savedAt}
            />
          </>
        )}
      </div>
    </section>
  );
};

export default ProfileEditor;

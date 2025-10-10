import React, { useEffect, useState, useMemo } from 'react';
import type { User } from 'firebase/auth';
import SideNav from '../../navigation/SideNav';
import UserSettingBar from '../dashboard/user-settings/userSettingBar';
import { apiFetch } from '../../../utils/api';
import type { ProfileSummary } from './profileOptions/types';
import ProfileEditor from './ProfileEditor';
import ProfileCard from './ProfileCard';
import './ProfileEditor.css';

interface ProfileProps {
  user: User;
}

function getProfileFallback(user: User): ProfileSummary {
  return {
    createdAt: user.metadata?.creationTime ?? null,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    emailVerified: user.emailVerified ?? null,
    requiredProfile: {},
  };
}

const Profile: React.FC<ProfileProps> = ({ user }) => {
  const displayName = user.displayName ?? user.email ?? 'friend';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [profile, setProfile] = useState<ProfileSummary | null>(null);
    const [mode, setMode] = useState<'required' | 'bonus'>('required');
                <ProfileEditor uid={user.uid} mode={mode} setMode={setMode} />

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const fetchProfile = async () => {
      try {
        const data = await apiFetch<ProfileSummary>('/profile');
        if (!active) return;
        setProfile(data ?? null);
      } catch (e) {
        if (!active) return;
        let msg = e instanceof Error ? e.message : String(e);
        try {
          const parsed = JSON.parse(msg);
          msg = parsed?.message ?? msg;
        } catch {
          // ignore JSON parse errors
        }
        if (msg.toLowerCase().includes('not found')) {
          setProfile(getProfileFallback(user));
        } else {
          setError(msg || 'Failed to load profile');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchProfile();
    return () => { active = false; };
  }, [user.displayName, user.email, user.emailVerified, user.metadata?.creationTime, user]);

  const createdAtText = useMemo(() => {
    const created = profile?.createdAt ?? user.metadata?.creationTime ?? null;
    if (!created) return '—';
    try {
      const d = new Date(created);
      if (Number.isNaN(d.getTime())) return String(created);
      return d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'medium' });
    } catch {
      return String(created);
    }
  }, [profile?.createdAt, user.metadata?.creationTime]);

  return (
    <div className="profile-editor-shell">
      <SideNav activeKey="profile" />
      <div className="profile-editor-canvas">
        <main className="profile-editor-main" role="main">
          <UserSettingBar name={displayName} photoURL={user.photoURL ?? null} />
          <div className="profile-editor-left">
            <header className="profile-editor-header">
              <div>
                <p className="profile-editor-message">Your account</p>
                <h1 className="profile-editor-main-title">Profile</h1>
                <p className="profile-editor-welcome">Manage your personal and health details.</p>
              </div>
            </header>
            <div className="profile-editor-split">
              <div className="profile-editor-split-half">
                {/* Control mode in parent to sync with ProfileCard */}
                <ProfileEditor uid={user.uid} mode={mode} setMode={setMode} />
              </div>
              <div className="profile-editor-split-half">
                <ProfileCard
                  loading={loading}
                  error={error}
                  profile={profile}
                  user={user}
                  createdAtText={createdAtText}
                  mode={mode}
                />
                {error && <div className="profile-error">{error}</div>}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Profile;

import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import SideNav from '../../navigation/SideNav';
import UserSettingBar from '../dashboard/user-settings/userSettingBar';
import { apiFetch } from '../../../utils/api';
import '../dashboard/Dashboard.css';

type RequiredProfile = {
  activityLevel: string | null;
  age: number | null;
  fitnessGoal: string | null;
  gender: string | null;
  height: number | null;
  weight: number | null;
};

type ProfileSummary = {
  createdAt?: string | number | Date | null;
  displayName?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  requiredProfile?: Partial<RequiredProfile> | null;
};

interface ProfileProps {
  user: User;
}

const Profile: React.FC<ProfileProps> = ({ user }) => {
  const displayName = user.displayName ?? user.email ?? 'friend';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<ProfileSummary>('/profile')
      .then((data) => {
        if (!active) return;
        setProfile(data ?? null);
      })
      .catch((e) => {
        if (!active) return;
        const msg = e instanceof Error ? e.message : String(e);
        // Treat "Profile not found" or 404 responses as empty profile and fall back to Firebase user
        try {
          const parsed = JSON.parse(msg);
          if (parsed && typeof parsed === 'object' && (parsed.message?.toLowerCase?.().includes('not found') || parsed.message?.toLowerCase?.().includes('profile not found'))) {
            setProfile({
              createdAt: user.metadata?.creationTime ?? null,
              displayName: user.displayName ?? null,
              email: user.email ?? null,
              emailVerified: user.emailVerified ?? null,
              requiredProfile: {}
            });
            return;
          }
        } catch {
          // not JSON; fall through
        }
        if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('profile not found')) {
          setProfile({
            createdAt: user.metadata?.creationTime ?? null,
            displayName: user.displayName ?? null,
            email: user.email ?? null,
            emailVerified: user.emailVerified ?? null,
            requiredProfile: {}
          });
          return;
        }
        setError(msg || 'Failed to load profile');
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [user.displayName, user.email, user.emailVerified, user.metadata?.creationTime]);

  const createdAtText = (() => {
    const created = profile?.createdAt ?? user.metadata?.creationTime ?? null;
    if (!created) return '—';
    try {
      const d = new Date(created);
      if (Number.isNaN(d.getTime())) return String(created);
      return d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'medium' });
    } catch {
      return String(created);
    }
  })();

  const r = profile?.requiredProfile ?? {};

  return (
    <div className="dashboard-shell">
      <SideNav activeKey="profile" />
      <div className="dashboard-canvas">
        <main className="dashboard-main" role="main">
          <UserSettingBar name={displayName} photoURL={user.photoURL ?? null} />
          <div className="dashboard-left">
            <header className="dashboard-header">
              <div>
                <p className="dashboard-subtitle">Your account</p>
                <h1 className="dashboard-title">Profile</h1>
                <p className="dashboard-welcome">Manage your personal and health details.</p>
              </div>
            </header>

            <section className="dashboard-widget">
              <h3 className="dashboard-widget-title">Profile card</h3>
              <div className="dashboard-widget-body" style={{ display: 'grid', gap: 8 }}>
                {loading ? (
                  <p>Loading…</p>
                ) : error ? (
                  <p className="security-message">{error}</p>
                ) : (
                  <>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div><strong>Created:</strong> {createdAtText}</div>
                      <div><strong>Name:</strong> {profile?.displayName ?? user.displayName ?? '—'}</div>
                      <div><strong>Email:</strong> {profile?.email ?? user.email ?? '—'}</div>
                      <div><strong>Email verified:</strong> {(profile?.emailVerified ?? user.emailVerified) ? 'Yes' : 'No'}</div>
                    </div>
                    <hr style={{ border: 0, borderTop: '1px solid var(--color-gray-200)' }} />
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div><strong>Required profile</strong></div>
                      <div><span style={{ color: 'var(--color-gray-600)' }}>Activity level:</span> {r.activityLevel ?? '—'}</div>
                      <div><span style={{ color: 'var(--color-gray-600)' }}>Age:</span> {r.age ?? '—'}</div>
                      <div><span style={{ color: 'var(--color-gray-600)' }}>Fitness goal:</span> {r.fitnessGoal ?? '—'}</div>
                      <div><span style={{ color: 'var(--color-gray-600)' }}>Gender:</span> {r.gender ?? '—'}</div>
                      <div><span style={{ color: 'var(--color-gray-600)' }}>Height:</span> {r.height ?? '—'}</div>
                      <div><span style={{ color: 'var(--color-gray-600)' }}>Weight:</span> {r.weight ?? '—'}</div>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          <aside className="dashboard-right" aria-label="Secondary widgets">
            <div className="dashboard-widget">
              <h3 className="dashboard-widget-title">Tips</h3>
              <div className="dashboard-widget-body">
                <p>Update your required profile to get tailored plans.</p>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default Profile;

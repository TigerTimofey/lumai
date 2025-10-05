import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../../utils/api';
import ToggleSwitch from '../../../shared/toggle/ToggleSwitch';
import './privacy.css';

type ConsentsResponse = {
  notifications?: { insights?: boolean; reminders?: boolean; marketing?: boolean };
  sharingPreferences?: { shareWithCoaches?: boolean; shareWithResearch?: boolean };
  agreements?: Record<string, { status: 'granted' | 'denied' | 'pending' }>;
};

type PrivacyPayload = {
  profileVisibility: 'private' | 'connections' | 'public';
  shareWithCoaches: boolean;
  shareWithResearch: boolean;
  emailNotifications: { insights: boolean; reminders: boolean; marketing: boolean };
};

// Map design labels to backend fields
// newsletter -> marketing, progressUpdates -> insights, workoutReminders -> reminders
const EmailNotificationsWidget: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newsletter, setNewsletter] = useState(false);
  const [progressUpdates, setProgressUpdates] = useState(true);
  const [workoutReminders, setWorkoutReminders] = useState(true);

  const [shareWithCoaches, setShareWithCoaches] = useState(false);
  const [shareWithResearch, setShareWithResearch] = useState(false);
  const [profileVisibility, setProfileVisibility] = useState<PrivacyPayload['profileVisibility']>('private');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<ConsentsResponse>('/privacy')
      .then((d) => {
        if (!active) return;
        const n = d.notifications ?? {};
        const s = d.sharingPreferences ?? {};
        setNewsletter(Boolean(n.marketing ?? false));
        setProgressUpdates(Boolean(n.insights ?? true));
        setWorkoutReminders(Boolean(n.reminders ?? true));
        setShareWithCoaches(Boolean(s.shareWithCoaches ?? false));
        setShareWithResearch(Boolean(s.shareWithResearch ?? false));
      })
      .catch((e) => {
        if (!active) return;
        const msg = (e as Error)?.message?.toLowerCase?.() ?? '';
        if (!msg.includes('not found')) setError((e as Error)?.message || 'Failed to load');
      })
      .finally(() => active && setLoading(false));

    // Fetch current profile visibility so PUT preserves it
    apiFetch<{ privacy?: { profileVisibility?: 'private' | 'connections' | 'public' } }>('/auth/whoami')
      .then((u) => {
        if (!active) return;
        const pv = u?.privacy?.profileVisibility ?? 'private';
        setProfileVisibility(pv);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      active = false;
    };
  }, []);

  const submitAll = async (next: Partial<{
    newsletter: boolean;
    progressUpdates: boolean;
    workoutReminders: boolean;
  }>) => {
    setError(null);
    const payload: PrivacyPayload = {
      profileVisibility,
      shareWithCoaches,
      shareWithResearch,
      emailNotifications: {
        insights: next.progressUpdates ?? progressUpdates,
        reminders: next.workoutReminders ?? workoutReminders,
        marketing: next.newsletter ?? newsletter,
      },
    };
    await apiFetch('/privacy', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  };

  const toggleNewsletter = async () => {
    const next = !newsletter;
    setNewsletter(next);
    try {
      await submitAll({ newsletter: next });
    } catch (e) {
      setNewsletter(!next);
      setError((e as Error)?.message || 'Update failed');
    }
  };
  const toggleProgress = async () => {
    const next = !progressUpdates;
    setProgressUpdates(next);
    try {
      await submitAll({ progressUpdates: next });
    } catch (e) {
      setProgressUpdates(!next);
      setError((e as Error)?.message || 'Update failed');
    }
  };
  const toggleReminders = async () => {
    const next = !workoutReminders;
    setWorkoutReminders(next);
    try {
      await submitAll({ workoutReminders: next });
    } catch (e) {
      setWorkoutReminders(!next);
      setError((e as Error)?.message || 'Update failed');
    }
  };

  return (
    <div className="dashboard-widget" aria-busy={loading} aria-live="polite">
      <h3 className="dashboard-widget-title">Email notifications</h3>
      <div className="dashboard-widget-body">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <ul className="settings-list">
            <li className="settings-row">
              <span className="settings-label">Newsletter marketing</span>
              <ToggleSwitch checked={newsletter} onChange={() => toggleNewsletter()} label="Newsletter marketing" />
            </li>
            <li className="settings-row">
              <span className="settings-label">Progress insights</span>
              <ToggleSwitch checked={progressUpdates} onChange={() => toggleProgress()} label="Progress insights" />
            </li>
            <li className="settings-row">
              <span className="settings-label">Workout reminders</span>
              <ToggleSwitch checked={workoutReminders} onChange={() => toggleReminders()} label="Workout reminders" />
            </li>
          </ul>
        )}
        {error && (
          <p role="alert" className="settings-hint" style={{ color: 'crimson' }}>{error}</p>
        )}
      </div>
    </div>
  );
};

export default EmailNotificationsWidget;

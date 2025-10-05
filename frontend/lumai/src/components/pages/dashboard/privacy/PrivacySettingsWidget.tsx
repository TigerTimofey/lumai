import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../../utils/api';
import ToggleSwitch from '../../../shared/toggle/ToggleSwitch';
import iconPrivate from '../../../../assets/icons/private.svg';
import iconConnections from '../../../../assets/icons/connections.svg';
import iconPublic from '../../../../assets/icons/public.svg';
import './privacy.css';

type ProfileVisibility = 'private' | 'connections' | 'public';

type ConsentsDoc = {
  agreements?: Record<string, { status: 'granted' | 'denied' | 'pending' }>;
  sharingPreferences?: { shareWithCoaches?: boolean; shareWithResearch?: boolean };
};

type PrivacyPayload = {
  profileVisibility: ProfileVisibility;
  shareWithCoaches: boolean;
  shareWithResearch: boolean;
  emailNotifications: { insights: boolean; reminders: boolean; marketing: boolean };
};

const PrivacySettingsWidget: React.FC<{ onVisibilityResolved?: (v: ProfileVisibility) => void }> = ({ onVisibilityResolved }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>('private');
  const [shareWithCoaches, setShareWithCoaches] = useState(false);
  const [shareWithResearch, setShareWithResearch] = useState(false);

  // dataUsage maps to data_processing consent
  const [dataUsage, setDataUsage] = useState<boolean>(false);

  // For PUT payload, we also need notifications, but this widget won't change them.
  const [notifications, setNotifications] = useState({ insights: true, reminders: true, marketing: false });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    // Load both privacy prefs (via GET /privacy) and current consent for data_processing
    apiFetch<ConsentsDoc>('/privacy')
      .then((doc) => {
        if (!active) return;
        const sp = doc.sharingPreferences ?? {};
        setShareWithCoaches(Boolean(sp.shareWithCoaches ?? false));
        setShareWithResearch(Boolean(sp.shareWithResearch ?? false));

        const dpStatus = doc.agreements?.data_processing?.status ?? 'pending';
        setDataUsage(dpStatus === 'granted');
      })
      .catch((e) => {
        if (!active) return;
        const msg = (e as Error)?.message?.toLowerCase?.() ?? '';
        if (!msg.includes('not found')) setError((e as Error)?.message || 'Failed to load');
      })
      .finally(() => active && setLoading(false));

    // Load current profile visibility from whoami's user privacy mirror if needed
  apiFetch<{ privacy?: { profileVisibility?: ProfileVisibility; emailNotifications?: { insights?: boolean; reminders?: boolean; marketing?: boolean } } }>('/auth/whoami')
      .then((u) => {
        if (!active) return;
        const pv: ProfileVisibility = (u?.privacy?.profileVisibility as ProfileVisibility) ?? 'private';
        setProfileVisibility(pv);
        onVisibilityResolved?.(pv);
        // Also snapshot notifications if available for future PUT payloads
        const n = u?.privacy?.emailNotifications;
        if (n) setNotifications({
          insights: Boolean(n.insights ?? true),
          reminders: Boolean(n.reminders ?? true),
          marketing: Boolean(n.marketing ?? false),
        });
      })
      .catch(() => {
        // best effort; defaults are fine
      });

    return () => {
      active = false;
    };
  }, [onVisibilityResolved]);

  const savePrivacy = async (next: Partial<{ profileVisibility: ProfileVisibility; shareWithCoaches: boolean; shareWithResearch: boolean }>) => {
    setError(null);
    const payload: PrivacyPayload = {
      profileVisibility: next.profileVisibility ?? profileVisibility,
      shareWithCoaches: next.shareWithCoaches ?? shareWithCoaches,
      shareWithResearch: next.shareWithResearch ?? shareWithResearch,
      emailNotifications: notifications,
    };
    await apiFetch('/privacy', { method: 'PUT', body: JSON.stringify(payload) });
  };

  const toggleDataUsage = async () => {
    const next = !dataUsage;
    setDataUsage(next);
    try {
      await apiFetch('/privacy/consents', {
        method: 'POST',
        body: JSON.stringify({ consentType: 'data_processing', status: next ? 'granted' : 'denied' }),
      });
    } catch (e) {
      setDataUsage(!next);
      setError((e as Error)?.message || 'Failed to update');
    }
  };

  const setVisibilityValue = async (next: ProfileVisibility) => {
    const prev = profileVisibility;
    setProfileVisibility(next);
    try {
      await savePrivacy({ profileVisibility: next });
    } catch (e) {
      setProfileVisibility(prev);
      setError((e as Error)?.message || 'Failed to update');
    }
  };

  const toggleCoaches = async () => {
    const next = !shareWithCoaches;
    setShareWithCoaches(next);
    try {
      await savePrivacy({ shareWithCoaches: next });
    } catch (e) {
      setShareWithCoaches(!next);
      setError((e as Error)?.message || 'Failed to update');
    }
  };

  const toggleResearch = async () => {
    const next = !shareWithResearch;
    setShareWithResearch(next);
    try {
      await savePrivacy({ shareWithResearch: next });
    } catch (e) {
      setShareWithResearch(!next);
      setError((e as Error)?.message || 'Failed to update');
    }
  };

  return (
    <div className="dashboard-widget" aria-busy={loading}>
      <h3 className="dashboard-widget-title">Privacy settings</h3>
      <div className="dashboard-widget-body">
        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className="settings-row">
              <div className="privacy-visibility-container">
                <span className="settings-label settings-label-inline">
                  Profile visibility
                  <span aria-hidden className="settings-label-icon" />
                </span>
                {(() => {
                  const segClass =
                    profileVisibility === 'private'
                      ? 'seg-0'
                      : profileVisibility === 'connections'
                      ? 'seg-1'
                      : 'seg-2';
                  return (
                    <div className={`privacy-segment ${segClass}`}>
                      <div className="privacy-thumb" aria-hidden />
                      <button
                        type="button"
                        className="privacy-option"
                        aria-selected={profileVisibility === 'private'}
                        onClick={() => void setVisibilityValue('private')}
                      >
                        <img src={iconPrivate} alt="" aria-hidden className="privacy-option-icon" />
                        <span className="privacy-option-text">Private</span>
                      </button>
                      <button
                        type="button"
                        className="privacy-option"
                        aria-selected={profileVisibility === 'connections'}
                        onClick={() => void setVisibilityValue('connections')}
                      >
                        <img src={iconConnections} alt="" aria-hidden className="privacy-option-icon" />
                        <span className="privacy-option-text">Connects</span>
                      </button>
                      <button
                        type="button"
                        className="privacy-option"
                        aria-selected={profileVisibility === 'public'}
                        onClick={() => void setVisibilityValue('public')}
                      >
                        <img src={iconPublic} alt="" aria-hidden className="privacy-option-icon" />
                        <span className="privacy-option-text">Public</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-label">Share with coaches</span>
              <ToggleSwitch checked={shareWithCoaches} onChange={() => toggleCoaches()} label="Share with coaches" />
            </div>
            <div className="settings-row">
              <span className="settings-label">Share with research</span>
              <ToggleSwitch checked={shareWithResearch} onChange={() => toggleResearch()} label="Share with research" />
            </div>
            <div className="settings-row">
              <span className="settings-label">Data usage</span>
              <ToggleSwitch checked={dataUsage} onChange={() => toggleDataUsage()} label="Data usage" />
            </div>
          </>
        )}
        {error && <p role="alert" className="settings-error">{error}</p>}
      </div>
    </div>
  );
};

export default PrivacySettingsWidget;

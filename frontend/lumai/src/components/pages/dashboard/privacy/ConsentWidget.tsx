import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../../utils/api';

type ConsentType = 'data_processing' | 'ai_insights' | 'marketing';
type ConsentStatus = 'granted' | 'denied' | 'pending';

type ConsentsResponse = {
  agreements: Record<string, { consentType: ConsentType; status: ConsentStatus; updatedAt?: unknown }>;
  // Other fields exist (sharingPreferences, notifications, auditTrail) but we don't need them here
};

const CONSENT_LABELS: Record<ConsentType, string> = {
  data_processing: 'Data processing',
  ai_insights: 'AI insights',
  marketing: 'Marketing emails'
};

const CONSENT_ORDER: ConsentType[] = ['data_processing', 'ai_insights', 'marketing'];

const ConsentWidget: React.FC = () => {
  const [agreements, setAgreements] = useState<Record<ConsentType, ConsentStatus>>({
    data_processing: 'pending',
    ai_insights: 'pending',
    marketing: 'pending'
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [updating, setUpdating] = useState<Record<ConsentType, boolean>>({
    data_processing: false,
    ai_insights: false,
    marketing: false
  });
  const [error, setError] = useState<string | null>(null);

  const checkedState = useMemo(() => {
    return (type: ConsentType) => agreements[type] === 'granted';
  }, [agreements]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<ConsentsResponse>('/privacy')
      .then((data) => {
        if (!active) return;
        const next: Record<ConsentType, ConsentStatus> = {
          data_processing: data.agreements?.data_processing?.status ?? 'pending',
          ai_insights: data.agreements?.ai_insights?.status ?? 'pending',
          marketing: data.agreements?.marketing?.status ?? 'pending'
        };
        setAgreements(next);
      })
      .catch((e: Error) => {
        // If the consent document doesn't exist yet, keep defaults without surfacing an error
        if (!active) return;
        const msg = (e.message || '').toLowerCase();
        if (!msg.includes('not found')) {
          setError(e.message || 'Failed to load consents');
        }
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, []);

  const toggleConsent = async (consentType: ConsentType) => {
    setError(null);
    setUpdating((s) => ({ ...s, [consentType]: true }));
    const prevStatus: ConsentStatus = agreements[consentType] ?? 'pending';
    const nextStatus: ConsentStatus = prevStatus === 'granted' ? 'denied' : 'granted';

    // Optimistic update
    setAgreements((s) => ({ ...s, [consentType]: nextStatus }));
    try {
      await apiFetch<ConsentsResponse>('/privacy/consents', {
        method: 'POST',
        body: JSON.stringify({ consentType, status: nextStatus })
      });
    } catch (e) {
      // Revert on failure to the previous known state
      setAgreements((s) => ({ ...s, [consentType]: prevStatus }));
      setError((e as Error)?.message || 'Failed to update consent');
    } finally {
      setUpdating((s) => ({ ...s, [consentType]: false }));
    }
  };

  return (
    <div className="dashboard-widget" aria-busy={loading} aria-live="polite">
      <h3 className="dashboard-widget-title">Privacy & consents</h3>
      <div className="dashboard-widget-body">
        {loading ? (
          <p>Loading consents…</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {CONSENT_ORDER.map((type) => (
              <li key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                <label htmlFor={`consent-${type}`} style={{ fontSize: 14, color: 'var(--color-gray-600)' }}>
                  {CONSENT_LABELS[type]}
                </label>
                <label className="switch" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input
                    id={`consent-${type}`}
                    type="checkbox"
                    role="switch"
                    aria-checked={checkedState(type)}
                    checked={checkedState(type)}
                    onChange={() => toggleConsent(type)}
                    disabled={updating[type]}
                  />
                  <span style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>
                    {agreements[type] === 'granted' ? 'On' : agreements[type] === 'denied' ? 'Off' : 'Pending'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" style={{ color: 'crimson', marginTop: 8, fontSize: 13 }}>{error}</p>
        )}
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--color-gray-500)' }}>
          You can change these anytime. Some features (like AI insights) may be disabled when consent is off.
        </p>
      </div>
    </div>
  );
};

export default ConsentWidget;

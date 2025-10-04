import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../../utils/api';

const TwoFactorWidget: React.FC = () => {
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [activating, setActivating] = useState(false);

  type WhoAmI = {
    uid?: string;
    email?: string | null;
    emailVerified?: boolean;
    mfa?: { enabled?: boolean };
    lastActivityAt?: unknown;
  } | null;

  const loadWhoAmI = async () => {
    try {
      const data = await apiFetch<WhoAmI>(`/auth/whoami`);
      const enabled = Boolean(data?.mfa?.enabled);
      setMfaEnabled(enabled);
      setMessage(`MFA status refreshed: ${enabled ? 'Enabled' : 'Disabled'}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to refresh status');
    }
  };

  useEffect(() => {
    void loadWhoAmI();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enroll = async () => {
    setMessage(null);
    setEnrolling(true);
    try {
      const data = await apiFetch<{ otpauthUrl: string }>(`/auth/mfa/enroll`, {
        method: 'POST',
        body: JSON.stringify({ label: 'Lumai 2FA' })
      });
      setQrcode(data.otpauthUrl);
      setMessage('Scan the QR in your authenticator app, then enter a 6-digit code to enable.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Enroll failed');
    } finally {
      setEnrolling(false);
    }
  };

  const activate = async () => {
    setMessage(null);
    if (!code || code.trim().length < 6) {
      setMessage('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setActivating(true);
    try {
      await apiFetch(`/auth/mfa/activate`, {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() })
      });
      setMessage('2FA enabled for your account.');
      setCode('');
      setQrcode(null);
      await loadWhoAmI();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Activation failed');
    } finally {
      setActivating(false);
    }
  };

  const disable = async () => {
    setMessage(null);
    try {
      await apiFetch(`/auth/mfa/disable`, { method: 'POST' });
      setMessage('2FA disabled.');
      await loadWhoAmI();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Disable failed');
    }
  };

  // session refresh controls moved to SessionWidget

  return (
    <div className="dashboard-widget">
      <h3 className="dashboard-widget-title">Security</h3>
      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          MFA status:{' '}
          {mfaEnabled == null ? (
            '—'
          ) : mfaEnabled ? (
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Enabled</span>
          ) : (
            <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>Disabled</span>
          )}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="dashboard-hero-action" onClick={loadWhoAmI}>
            Refresh MFA
          </button>
          {!mfaEnabled && (
            <button type="button" className="dashboard-hero-action" onClick={enroll}>
              {enrolling ? 'Generating QR code…' : 'Add 2FA'}
            </button>
          )}
          {mfaEnabled && (
            <button type="button" className="dashboard-hero-action" onClick={disable}>
              Disable 2FA
            </button>
          )}
        </div>
        {qrcode && !mfaEnabled && (
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>Scan this QR in your authenticator app:</p>
            <img
              alt="MFA QR"
              style={{ width: 160, height: 160 }}
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrcode)}`}
            />
            <details>
              <summary style={{ cursor: 'pointer' }}>Or copy the otpauth URL</summary>
              <code style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{qrcode}</code>
            </details>
            <input
              placeholder="Enter 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="auth-input"
              inputMode="numeric"
              pattern="[0-9]*"
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="dashboard-hero-action" onClick={activate}>
                {activating ? 'Enabling…' : 'Enable 2FA'}
              </button>
            </div>
          </div>
        )}
        {/* Session refresh moved to SessionWidget */}
        {message && <p style={{ margin: 0, color: 'var(--color-gray-600)' }}>{message}</p>}
      </div>
    </div>
  );
};

export default TwoFactorWidget;

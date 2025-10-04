import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../utils/api';
import { auth } from '../../../config/firebase';

const SecurityPanel: React.FC = () => {
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  type WhoAmI = { mfa?: { enabled?: boolean } } | null;

  const loadWhoAmI = async () => {
    try {
      const data = await apiFetch<WhoAmI>(`/auth/whoami`);
      setMfaEnabled(Boolean(data?.mfa?.enabled));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadWhoAmI();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enroll = async () => {
    setMessage(null);
    const data = await apiFetch<{ otpauthUrl: string; base32: string }>(`/auth/mfa/enroll`, {
      method: 'POST',
      body: JSON.stringify({ label: 'Lumai 2FA' })
    });
    setSecret(data.base32);
    setQrcode(data.otpauthUrl);
    setMessage('Scan the QR (otpauth URL) in your authenticator app, then enter a code to activate.');
  };

  const activate = async () => {
    setMessage(null);
    await apiFetch(`/auth/mfa/activate`, {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    setMessage('2FA enabled for your account.');
    setCode('');
    setSecret(null);
    setQrcode(null);
    await loadWhoAmI();
  };

  const disable = async () => {
    setMessage(null);
    await apiFetch(`/auth/mfa/disable`, { method: 'POST' });
    setMessage('2FA disabled.');
    await loadWhoAmI();
  };

  const refresh = async () => {
    setMessage(null);
    const refreshToken = auth.currentUser?.refreshToken;
    if (!refreshToken) {
      setMessage('No refresh token available. Please sign in first.');
      return;
    }
    try {
      const data = await apiFetch<{ idToken: string; expiresIn: string }>(`/auth/refresh`, {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      });
      setMessage(`New ID token received (expires in ${data.expiresIn}s).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Refresh failed');
    }
  };

  return (
    <div className="dashboard-widget">
      <h3 className="dashboard-widget-title">Security</h3>
      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>MFA status: {mfaEnabled == null ? '—' : mfaEnabled ? 'Enabled' : 'Disabled'}</p>
        <button type="button" className="dashboard-hero-action" onClick={loadWhoAmI}>
          Refresh status
        </button>
        <button type="button" className="dashboard-hero-action" onClick={enroll}>
          Enroll 2FA
        </button>
        {qrcode && (
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>otpauth URL (copy into your authenticator app):</p>
            <code style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{qrcode}</code>
          </div>
        )}
        {secret && <p style={{ margin: 0, fontSize: '0.9rem' }}>Secret (base32): {secret}</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          <input
            placeholder="Enter 6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="auth-input"
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="dashboard-hero-action" onClick={activate}>
              Activate 2FA
            </button>
            <button type="button" className="dashboard-hero-action" onClick={disable}>
              Disable 2FA
            </button>
          </div>
        </div>
        <button type="button" className="dashboard-hero-action" onClick={refresh}>
          Test refresh flow
        </button>
        {message && <p style={{ margin: 0, color: 'var(--color-gray-600)' }}>{message}</p>}
      </div>
    </div>
  );
};

export default SecurityPanel;

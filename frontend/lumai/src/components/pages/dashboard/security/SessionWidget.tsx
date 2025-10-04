import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../../utils/api';
import { auth } from '../../../../config/firebase';

const SessionWidget: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);
  const [, setRefreshToken] = useState<string>('');

  useEffect(() => {
    setRefreshToken(auth.currentUser?.refreshToken ?? '');
  }, []);

  const doRefresh = async () => {
    setMessage(null);
    const token = auth.currentUser?.refreshToken;
    if (!token) {
      setMessage('No refresh token available. Please sign in first.');
      return;
    }
    try {
      const data = await apiFetch<{ idToken: string; expiresIn: string; refreshToken?: string }>(`/auth/refresh`, {
        method: 'POST',
        body: JSON.stringify({ refreshToken: token })
      });
      if (data.refreshToken) {
        setRefreshToken(data.refreshToken);
      } else {
        setRefreshToken(auth.currentUser?.refreshToken ?? token);
      }
      setMessage(`New ID token received (expires in ${data.expiresIn}s).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Refresh failed');
    }
  };

  return (
    <div className="dashboard-widget">
      <h3 className="dashboard-widget-title">Session</h3>
      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 12 }}>
        <button type="button" className="dashboard-hero-action" onClick={doRefresh}>
          Refresh ID token
        </button>
        {message && <p style={{ margin: 0, color: 'var(--color-gray-600)' }}>{message}</p>}
      </div>
    </div>
  );
};

export default SessionWidget;

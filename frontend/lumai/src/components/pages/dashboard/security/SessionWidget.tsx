import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../../utils/api';
import { auth } from '../../../../config/firebase';
import { formatExpiryPhrase, formatSecondsMMSS } from '../../../../utils/time';
import { useSessionContext } from '../../../../context/SessionContext';
import './security.css';

const SessionWidget: React.FC = () => {
  const { sessionExpiry, resetSessionTimer } = useSessionContext();
  const [message, setMessage] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const countdownRef = useRef<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    if (!sessionExpiry) {
      setExpiresAt(null);
      setSecondsLeft(0);
      return;
    }

    const updateSeconds = () => {
      const remaining = Math.max(0, Math.floor((sessionExpiry - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && countdownRef.current) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };

    setExpiresAt(new Date(sessionExpiry));
    updateSeconds();
    countdownRef.current = window.setInterval(updateSeconds, 1000);

    return () => {
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [sessionExpiry]);

  const doRefresh = async () => {
    setMessage(null);
    setIsRefreshing(true);
    // stop any existing countdown while refreshing
    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setExpiresAt(null);
    setSecondsLeft(0);
    const token = auth.currentUser?.refreshToken;
    if (!token) {
      setMessage('No refresh token available. Please sign in first.');
      setIsRefreshing(false);
      return;
    }
    try {
      await apiFetch<{ idToken: string; expiresIn: string }>(`/auth/refresh`, {
        method: 'POST',
        body: JSON.stringify({ refreshToken: token })
      });
      // Force Firebase SDK to refresh its ID token, then seed countdown from it
      try {
        await auth.currentUser?.getIdToken(true);
      } catch {
        // ignore
      }
      resetSessionTimer();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="dashboard-widget">
      <h3 className="dashboard-widget-title">Session</h3>
      <div className="dashboard-widget-body" style={{ display: 'grid', gap: 12 }}>
        <button type="button" className="dashboard-hero-action" onClick={doRefresh} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing…' : 'Refresh ID token'}
        </button>
        <p className="security-message" style={{ margin: 0 }}>
          Expires {expiresAt ? (
            <>
              {formatExpiryPhrase(secondsLeft)} · {formatSecondsMMSS(secondsLeft)}
            </>
          ) : (
            '—'
          )}
        </p>
        {message && <p className="security-message" style={{ margin: 0 }}>{message}</p>}
      </div>
    </div>
  );
};

export default SessionWidget;

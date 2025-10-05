import React, { useEffect, useState } from 'react';
import { useCallback } from 'react';
import { useRef } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { apiFetch } from '../../../../utils/api';
import { auth } from '../../../../config/firebase';
import { formatExpiryPhrase, formatSecondsMMSS } from '../../../../utils/time';
import './security.css';

const SessionWidget: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);
  const [, setRefreshToken] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const countdownRef = useRef<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startCountdown = (expiry: Date) => {
    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setExpiresAt(expiry);
    const initial = Math.max(0, Math.floor((expiry.getTime() - Date.now()) / 1000));
    setSecondsLeft(initial);
    countdownRef.current = window.setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiry.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && countdownRef.current) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }, 1000);
  };

  const seedFromFirebase = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const info = await user.getIdTokenResult();
      if (info?.expirationTime) {
        const expiry = new Date(info.expirationTime);
        if (expiry.getTime() > Date.now()) startCountdown(expiry);
      }
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    setRefreshToken(auth.currentUser?.refreshToken ?? '');
  }, []);

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
      // Force Firebase SDK to refresh its ID token, then seed countdown from it
      try {
        await auth.currentUser?.getIdToken(true);
      } catch {
        // ignore
      }
      await seedFromFirebase();

    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Seed from existing Firebase ID token and keep in sync with token changes
  useEffect(() => {
    let unsub: (() => void) | null = null;

    void seedFromFirebase();
    try {
      unsub = onIdTokenChanged(auth, () => { void seedFromFirebase(); });
    } catch {
      unsub = null;
    }

    return () => {
      if (countdownRef.current) window.clearInterval(countdownRef.current);
      if (unsub) unsub();
    };
  }, [seedFromFirebase]);

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

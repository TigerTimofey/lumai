import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth } from './config/firebase';
import { logoutUser } from './utils/logout';

import AuthPage from './components/auth/AuthPage';
import Dashboard from './components/pages/dashboard/Dashboard';
import Profile from './components/pages/profile/Profile';
import AiInsightsPage from './components/pages/ai-insights/AiInsightsPage';
import AnalyticsPage from './components/pages/analytics/AnalyticsPage';
import CaloriesPage from './components/pages/calories/CaloriesPage';
import AssistantPage from './components/pages/assistant/AssistantPage';

import DataUsageConsentModal from './components/privacy/DataUsageConsentModal';
import { SESSION_TIMEOUT_MS } from './config/session';
import SessionContext, { type SessionContextValue } from './context/SessionContext';
import { apiFetch } from './utils/api';
import ApiErrorToast from './components/shared/ApiErrorToast';

function App() {
  const [authedUser, setAuthedUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [path, setPath] = useState<string>(() => (typeof window !== 'undefined' ? window.location.pathname : '/dashboard'));
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);
  const sessionTimeoutRef = useRef<number | null>(null);
  const [dataProcessingConsent, setDataProcessingConsent] = useState<'pending' | 'granted' | 'denied' | null>(null);

  const clearSessionTimeout = useCallback(() => {
    if (sessionTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
  }, []);

  const scheduleSessionTimeout = useCallback(() => {
    if (!authedUser) {
      setSessionExpiry(null);
      return;
    }
    if (typeof window === 'undefined') return;
    if (SESSION_TIMEOUT_MS <= 0) {
      setSessionExpiry(null);
      return;
    }

    clearSessionTimeout();
    const expiry = Date.now() + SESSION_TIMEOUT_MS;
    setSessionExpiry(expiry);
    sessionTimeoutRef.current = window.setTimeout(() => {
      sessionTimeoutRef.current = null;
      setSessionExpiry(null);
      void logoutUser();
    }, SESSION_TIMEOUT_MS);
  }, [authedUser, clearSessionTimeout]);

  useEffect(() => {
    if (!authedUser) {
      clearSessionTimeout();
      setSessionExpiry(null);
      return;
    }

    scheduleSessionTimeout();

    return () => {
      clearSessionTimeout();
    };
  }, [authedUser, scheduleSessionTimeout, clearSessionTimeout]);

  const sessionContextValue = useMemo<SessionContextValue>(() => ({
    sessionExpiry,
    resetSessionTimer: scheduleSessionTimeout
  }), [sessionExpiry, scheduleSessionTimeout]);

  useEffect(() => {
    if (!authedUser) {
      setDataProcessingConsent(null);
      return;
    }
    let active = true;
    apiFetch<{ agreements: Record<string, { status: 'pending' | 'granted' | 'denied' }> }>('/privacy')
      .then((data) => {
        if (!active) return;
        setDataProcessingConsent(data.agreements?.data_processing?.status ?? 'pending');
      })
      .catch(() => {
        if (!active) return;
        setDataProcessingConsent('pending');
      });
    return () => {
      active = false;
    };
  }, [authedUser]);

  const handleAuthenticated = (user: User) => {
    const isTrustedProvider = [user.providerId, ...user.providerData.map(p => p?.providerId)]
      .filter(Boolean)
      .includes('github.com');
    const canAccess = user.emailVerified || isTrustedProvider;

    if (canAccess) {
      console.group('AUTHENTICATED USER CONTEXT');
      // console.log('UID', user.uid);
      // console.log('Display name', user.displayName);
      // console.log('Email', user.email);
      // console.log('Photo URL', user.photoURL);
      // console.log('Email verified', user.emailVerified);
      // console.log('Provider data', user.providerData);
      // console.log('Metadata', user.metadata);
      console.groupEnd();
      // default landing after sign-in
      window.history.pushState({}, '', '/dashboard');
      setPath('/dashboard');
      setAuthedUser(user);
    }
  };

  const handleConsentAccept = useCallback(async () => {
    try {
      await apiFetch('/privacy/consents', {
        method: 'POST',
        body: JSON.stringify({ consentType: 'data_processing', status: 'granted' })
      });
      setDataProcessingConsent('granted');
    } catch (error) {
      console.error('Failed to accept consent:', error);
    }
  }, []);

  const handleConsentDecline = useCallback(async () => {
    try {
      await apiFetch('/privacy/consents', {
        method: 'POST',
        body: JSON.stringify({ consentType: 'data_processing', status: 'denied' })
      });
      setDataProcessingConsent('denied');
      void logoutUser();
    } catch (error) {
      console.error('Failed to decline consent:', error);
    }
  }, []);

  const handleConsentReview = useCallback(async () => {
    try {
      await apiFetch('/privacy/consents', {
        method: 'POST',
        body: JSON.stringify({ consentType: 'data_processing', status: 'pending' })
      });
      setDataProcessingConsent('pending');
    } catch (error) {
      console.error('Failed to review consent:', error);
    }
  }, []);

  // Persist session locally and restore user on refresh without logging out
  useEffect(() => {
    void setPersistence(auth, browserLocalPersistence).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const isTrustedProvider = [user.providerId, ...user.providerData.map(p => p?.providerId)]
          .filter(Boolean)
          .includes('github.com');
        const canAccess = user.emailVerified || isTrustedProvider;

        if (canAccess) {
          setAuthedUser(user);
          // If landing on root, send to dashboard; otherwise preserve current path
          if (window.location.pathname === '/') {
            window.history.replaceState({}, '', '/dashboard');
            setPath('/dashboard');
          } else {
            setPath(window.location.pathname);
          }
        } else {
          setAuthedUser(null);
          if (window.location.pathname !== '/') {
            window.history.replaceState({}, '', '/');
            setPath('/');
          }
        }
      } else {
        setAuthedUser(null);
        if (window.location.pathname !== '/') {
          window.history.replaceState({}, '', '/');
          setPath('/');
        }
      }
      setInitializing(false);
    });

    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      unsubscribe();
    };
  }, []);

  const isDashboardAccessible = Boolean(
    authedUser &&
      (authedUser.emailVerified ||
        [authedUser.providerId, ...authedUser.providerData.map(p => p?.providerId)]
          .filter(Boolean)
          .includes('github.com'))
  );

  let content: ReactNode;

  if (!initializing && isDashboardAccessible && authedUser) {
    if (path.startsWith('/profile')) {
      content = <Profile user={authedUser} />;
    } else if (path.startsWith('/analytics')) {
      content = <AnalyticsPage user={authedUser} />;
    } else if (path.startsWith('/ai-insights')) {
      content = <AiInsightsPage user={authedUser} />;
    } else if (path.startsWith('/nutrition')) {
      content = <CaloriesPage user={authedUser} />;
    } else if (path.startsWith('/assistant')) {
      content = <AssistantPage user={authedUser} />;
    } else {
      content = <Dashboard user={authedUser} />;
    }
  } else if (initializing) {
    content = (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100%',
        color: 'var(--color-primary)'
      }}>
          <span style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>Lumai checking credentials...</span>
      </div>
    );
  } else {
    content = <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  const shouldShowConsentModal = dataProcessingConsent === 'pending' || dataProcessingConsent === 'denied';
  const consentMode = dataProcessingConsent === 'denied' ? 'declined' : 'pending';

  return (
    <SessionContext.Provider value={sessionContextValue}>
      {content}
      {!initializing && shouldShowConsentModal && (
        <DataUsageConsentModal
          open
          mode={consentMode}
          onAccept={handleConsentAccept}
          onDecline={handleConsentDecline}
          onReview={handleConsentReview}
        />
      )}
      <ApiErrorToast />
    </SessionContext.Provider>
  );
}

export default App;

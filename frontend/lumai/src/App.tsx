import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { auth } from './config/firebase';

import AuthPage from './components/auth/AuthPage';
import Dashboard from './components/pages/dashboard/Dashboard';
import Profile from './components/pages/profile/Profile';
import AiInsightsPage from './components/pages/ai-insights/AiInsightsPage';

function App() {
  const [authedUser, setAuthedUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [path, setPath] = useState<string>(() => (typeof window !== 'undefined' ? window.location.pathname : '/dashboard'));

  const handleAuthenticated = (user: User) => {
    const isTrustedProvider = [user.providerId, ...user.providerData.map(p => p?.providerId)]
      .filter(Boolean)
      .includes('github.com');
    const canAccess = user.emailVerified || isTrustedProvider;

    if (canAccess) {
      console.group('AUTHENTICATED USER CONTEXT');
      console.log('UID', user.uid);
      console.log('Display name', user.displayName);
      console.log('Email', user.email);
      console.log('Photo URL', user.photoURL);
      console.log('Email verified', user.emailVerified);
      console.log('Provider data', user.providerData);
      console.log('Metadata', user.metadata);
      console.groupEnd();
      // default landing after sign-in
      window.history.pushState({}, '', '/dashboard');
      setPath('/dashboard');
      setAuthedUser(user);
    }
  };

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

  if (!initializing && isDashboardAccessible && authedUser) {
    if (path.startsWith('/profile')) return <Profile user={authedUser} />;
    if (path.startsWith('/ai-insights')) return <AiInsightsPage user={authedUser} />;
    return <Dashboard user={authedUser} />;
  }

  // While Firebase restores session, show a minimal splash to avoid login-page flicker
  if (initializing) {
    return (
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
  }

  return <AuthPage onAuthenticated={handleAuthenticated} />;
}

export default App;

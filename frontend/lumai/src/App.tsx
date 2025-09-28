import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

import AuthPage from './components/auth/AuthPage';
import Dashboard from './components/dashboard/Dashboard';

function App() {
  const [authedUser, setAuthedUser] = useState<User | null>(null);

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
      window.history.pushState({}, '', '/dashboard');
      setAuthedUser(user);
    }
  };

  useEffect(() => {
    if (!authedUser && window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
    }
  }, [authedUser]);

  const isDashboardAccessible = Boolean(
    authedUser &&
      (authedUser.emailVerified ||
        [authedUser.providerId, ...authedUser.providerData.map(p => p?.providerId)]
          .filter(Boolean)
          .includes('github.com'))
  );

  if (isDashboardAccessible && authedUser) {
    return <Dashboard user={authedUser} />;
  }

  return <AuthPage onAuthenticated={handleAuthenticated} />;
}

export default App;

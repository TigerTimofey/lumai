import React from 'react';
import type { User } from 'firebase/auth';
import { useLoginForm } from './useLoginForm';
import AuthStatus from '../../shared/auth-status/AuthStatus';
import githubIcon from '../../../assets/icons/github.svg'
import googleIcon from '../../../assets/icons/google.svg'
import './LoginForm.css';

interface LoginFormProps {
  onAuthenticated?: (user: User) => void;
  onResetModeChange?: (isReset: boolean) => void;
  resetActive?: boolean;
}

const LoginForm = ({ onAuthenticated, onResetModeChange, resetActive }: LoginFormProps) => {
  const { formData, handleChange, handleSubmit, handleGitHubLogin, handleGoogleLogin, handlePasswordReset, loading, emailLoading, githubLoading, googleLoading, error, success, mfaRequired, mfaCode, handleMfaChange, pendingOAuthProvider } = useLoginForm({
    onAuthenticated,
  });

  const [localError, setLocalError] = React.useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = React.useState<string | null>(null);
  const [isResetMode, setIsResetMode] = React.useState(false);
  const [resetLoading, setResetLoading] = React.useState(false);

  React.useEffect(() => {
    setLocalError(error);
  }, [error]);
  React.useEffect(() => {
    setLocalSuccess(success);
  }, [success]);

  React.useEffect(() => {
    onResetModeChange?.(isResetMode);
  }, [isResetMode, onResetModeChange]);

  // Sync reset mode with parent (e.g., clicking Sign in/Sign up tabs exits reset)
  React.useEffect(() => {
    setIsResetMode(!!resetActive);
  }, [resetActive]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isResetMode) {
      try {
        setResetLoading(true);
        await handlePasswordReset();
      } finally {
        setResetLoading(false);
      }
    } else {
      await handleSubmit(e);
    }
  };

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <AuthStatus
        message={localError || localSuccess}
        type={localError ? 'error' : localSuccess ? 'success' : 'info'}
        onClose={() => {
          setLocalError(null);
          setLocalSuccess(null);
        }}
      />

      {(!pendingOAuthProvider || isResetMode) && (
        <div className="auth-field">
          <label className="auth-label" htmlFor="email">
            Email
          </label>
          <input
            className="auth-input"
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="you@example.com"
            autoComplete="email"
            required
            disabled={loading}
          />
        </div>
      )}

      {!isResetMode && !pendingOAuthProvider && (
        <div className="auth-field">
          <label className="auth-label" htmlFor="password">
            Password
          </label>
          <input
            className="auth-input"
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
            disabled={loading}
          />
        </div>
      )}

      {mfaRequired && !isResetMode && (
        <div className="auth-field">
          <label className="auth-label" htmlFor="mfaCode">
            2FA code
          </label>
          <input
            className="auth-input"
            type="text"
            id="mfaCode"
            name="mfaCode"
            value={mfaCode}
            onChange={handleMfaChange}
            placeholder="Enter 6-digit code"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            disabled={loading}
          />
        </div>
      )}

      <button
        className="auth-primary"
        type="submit"
        disabled={isResetMode ? resetLoading : emailLoading || githubLoading || googleLoading}
      >
        {isResetMode
          ? (resetLoading ? 'Sending…' : 'Send reset link')
          : pendingOAuthProvider
            ? (githubLoading || googleLoading ? 'Verifying…' : 'Verify code')
            : emailLoading ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="auth-divider">or continue with</div>

      {!pendingOAuthProvider && (
        <div className="auth-oauth">
          <button
            type="button"
            onClick={handleGitHubLogin}
            disabled={githubLoading || isResetMode}
            aria-label="Sign in with GitHub"
          >
            {githubLoading ? 'Connecting GitHub…' : (
              <img src={githubIcon} alt="GitHub" />
            )}
          </button>
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || isResetMode}
            aria-label="Sign in with Google"
          >
            {googleLoading ? 'Connecting Google…' : (
              <img src={googleIcon} alt="Google" />
            )}
          </button>
        </div>
      )}

      {pendingOAuthProvider && (
        <p className="auth-hint" style={{ marginTop: 12 }}>
          Enter your 6-digit code to finish signing in with {pendingOAuthProvider === 'google.com' ? 'Google' : 'GitHub'} and click “Verify code”.
        </p>
      )}

      {!isResetMode && !pendingOAuthProvider && (
        <p className="auth-link" style={{ marginTop: 8 }}>
          Forgot your password?{' '}
          <button type="button" onClick={() => setIsResetMode(true)} disabled={loading}>
            Reset it
          </button>
        </p>
      )}
    </form>
  );
};

export default LoginForm;

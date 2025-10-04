import React from 'react';
import type { User } from 'firebase/auth';
import { useLoginForm } from './useLoginForm';
import AuthStatus from '../../shared/AuthStatus';
import './LoginForm.css';

interface LoginFormProps {
  onAuthenticated?: (user: User) => void;
  onResetModeChange?: (isReset: boolean) => void;
  resetActive?: boolean;
}

const LoginForm = ({ onAuthenticated, onResetModeChange, resetActive }: LoginFormProps) => {
  const { formData, handleChange, handleSubmit, handleGitHubLogin, handleGoogleLogin, handlePasswordReset, loading, emailLoading, githubLoading, googleLoading, error, success } = useLoginForm({
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

      {!isResetMode && (
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

      <button className="auth-primary" type="submit" disabled={isResetMode ? resetLoading : emailLoading}>
        {isResetMode ? (resetLoading ? 'Sending…' : 'Send reset link') : emailLoading ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="auth-divider">or continue with</div>

      <div className="auth-oauth">
        <button type="button" onClick={handleGitHubLogin} disabled={githubLoading || isResetMode}>
          {githubLoading ? 'Connecting GitHub…' : 'GitHub'}
        </button>
        <button type="button" onClick={handleGoogleLogin} disabled={googleLoading || isResetMode}>
          {googleLoading ? 'Connecting Google…' : 'Google'}
        </button>
        {!isResetMode && (
          <button
            type="button"
            onClick={() => setIsResetMode(true)}
            disabled={loading}
          >
            Forgot password?
          </button>
        )}
      </div>
    </form>
  );
};

export default LoginForm;

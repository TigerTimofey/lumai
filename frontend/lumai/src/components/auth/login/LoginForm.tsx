import React from 'react';
import type { User } from 'firebase/auth';
import { useLoginForm } from './useLoginForm';
import AuthStatus from '../../shared/AuthStatus';
import './LoginForm.css';

interface LoginFormProps {
  onAuthenticated?: (user: User) => void;
}

const LoginForm = ({ onAuthenticated }: LoginFormProps) => {
  const { formData, handleChange, handleSubmit, handleGitHubLogin, loading, emailLoading, githubLoading, error, success } = useLoginForm({
    onAuthenticated,
  });

  const [localError, setLocalError] = React.useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLocalError(error);
  }, [error]);
  React.useEffect(() => {
    setLocalSuccess(success);
  }, [success]);

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
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

      <button className="auth-primary" type="submit" disabled={emailLoading}>
        {emailLoading ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="auth-divider">or continue with</div>

      <div className="auth-oauth">
        <button type="button" onClick={handleGitHubLogin} disabled={githubLoading}>
          {githubLoading ? 'Connecting GitHub…' : 'GitHub'}
        </button>
      </div>
    </form>
  );
};

export default LoginForm;

import React from 'react';
import { useRegisterForm } from './useRegisterForm';
import AuthStatus from '../../shared/AuthStatus';
import './RegisterForm.css';

interface RegisterFormProps {
  onSwitchToLogin?: () => void;
}

const RegisterForm = ({ onSwitchToLogin }: RegisterFormProps) => {
  const { formData, handleChange, handleSubmit, loading, emailLoading, error, success } = useRegisterForm();
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
          placeholder="At least 6 characters"
          autoComplete="new-password"
          required
          disabled={loading}
        />
      </div>

      {/* <div className="auth-field">
        <label className="auth-label" htmlFor="displayName">
          Name (optional)
        </label>
        <input
          className="auth-input"
          type="text"
          id="displayName"
          name="displayName"
          value={formData.displayName}
          onChange={handleChange}
          placeholder="How should we call you?"
          autoComplete="name"
          disabled={loading}
        />
      </div> */}

      <button className="auth-primary" type="submit" disabled={emailLoading}>
        {emailLoading ? 'Signing up…' : 'Sign up'}
      </button>

      <p className="auth-link">
        Already have an account? <button type="button" onClick={onSwitchToLogin}>Sign in</button>
      </p>
    </form>
  );
};

export default RegisterForm;

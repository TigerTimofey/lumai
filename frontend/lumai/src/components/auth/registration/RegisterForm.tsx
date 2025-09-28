import { useRegisterForm } from './useRegisterForm';
import './RegisterForm.css';

interface RegisterFormProps {
  onSwitchToLogin?: () => void;
}

const RegisterForm = ({ onSwitchToLogin }: RegisterFormProps) => {
  const { formData, handleChange, handleSubmit, loading, emailLoading, error, success } = useRegisterForm();

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {error && <div className="auth-status error">{error}</div>}
      {success && <div className="auth-status">{success}</div>}

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

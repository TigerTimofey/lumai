import { useLoginForm } from './useLoginForm';
import './LoginForm.css';

const LoginForm = () => {
  const { formData, handleChange, handleSubmit, handleGitHubLogin, loading, error, success } = useLoginForm();

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
          placeholder="Enter your password"
          autoComplete="current-password"
          required
          disabled={loading}
        />
      </div>

      <button className="auth-primary" type="submit" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="auth-divider">or continue with</div>

      <div className="auth-oauth">
        <button type="button" onClick={handleGitHubLogin} disabled={loading}>
          {loading ? 'Connecting GitHub…' : 'GitHub'}
        </button>
      </div>
    </form>
  );
};

export default LoginForm;

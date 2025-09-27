import { useLoginForm } from './useLoginForm';

const LoginForm = () => {
  const { formData, handleChange, handleSubmit, handleGitHubLogin, loading, error } = useLoginForm();

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <div>
        <label htmlFor="email">Email:</label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          disabled={loading}
        />
      </div>
      <div>
        <label htmlFor="password">Password:</label>
        <input
          type="password"
          id="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          required
          disabled={loading}
        />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
      <button type="button" onClick={handleGitHubLogin} disabled={loading}>
        {loading ? 'Logging in...' : 'Login with GitHub'}
      </button>
    </form>
  );
};

export default LoginForm;
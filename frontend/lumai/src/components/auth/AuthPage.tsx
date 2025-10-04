import { useState } from 'react';
import type { User } from 'firebase/auth';

import LoginForm from './login/LoginForm';
import RegisterForm from './registration/RegisterForm';
import './AuthPage.css';

interface AuthPageProps {
  onAuthenticated?: (user: User) => void;
}

const AuthPage = ({ onAuthenticated }: AuthPageProps) => {
  const [mode, setMode] = useState<'register' | 'login'>('login');
  const [loginResetActive, setLoginResetActive] = useState(false);

  const isRegister = mode === 'register';

  return (
    <div className="auth-background">
      <div className="auth-shell">
        <section className="auth-hero">
          <div>
            <span className="auth-hero-badge">Numbers Don&apos;t Lie · Lumai</span>
            <h1>Personalized wellness insights powered by AI</h1>
            <p>
              Track progress, balance daily habits, and receive meaningful coaching prompts that help you
              stay consistent.
            </p>
            <div className="auth-hero-list">
              <div className="auth-hero-list-item">
                <span aria-hidden>✨</span>
                <span>Single account for every device, coach workflow, and activity stream.</span>
              </div>
              <div className="auth-hero-list-item">
                <span aria-hidden>🔒</span>
                <span>Multi-factor ready security and transparent privacy controls.</span>
              </div>
              <div className="auth-hero-list-item">
                <span aria-hidden>🧠</span>
                <span>AI-ready metrics that bring context to every recommendation.</span>
              </div>
            </div>
          </div>
          <p className="auth-hero-footnote">Built with product analysts, wellness coaches, and data lovers in mind.</p>
        </section>

        <section className="auth-card">
          <div className="auth-tabs" role="tablist">
            <div
              className={`auth-toggle-thumb ${isRegister ? 'right' : 'left'}`}
              aria-hidden
            />
            <button
              type="button"
              role="tab"
              className={`auth-tab ${!isRegister && !loginResetActive ? 'active' : ''}`}
              aria-selected={!isRegister && !loginResetActive}
              onClick={() => {
                setLoginResetActive(false);
                setMode('login');
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              className={`auth-tab ${isRegister ? 'active' : ''}`}
              aria-selected={isRegister}
              onClick={() => {
                setLoginResetActive(false);
                setMode('register');
              }}
            >
              Sign up
            </button>
          </div>

          <div className="auth-content">
            <div key={mode} className="auth-pane">
              <div>
                <h2>
                  {isRegister
                    ? 'Welcome to Lumai'
                    : loginResetActive
                      ? 'Reset your password'
                      : 'Great to see you again'}
                </h2>
                <p className="auth-card-subtitle">
                  {isRegister
                    ? 'Set up your profile, confirm your email, and start receiving tailored guidance in minutes.'
                    : loginResetActive
                      ? 'Enter your account email and we’ll send you a secure password reset link.'
                      : 'Use your account credentials or sign in with GitHub or Google to continue where you left off.'}
                </p>
              </div>

              {isRegister ? (
                <RegisterForm onSwitchToLogin={() => setMode('login')} />
              ) : (
                <LoginForm
                  onAuthenticated={onAuthenticated}
                  onResetModeChange={setLoginResetActive}
                  resetActive={loginResetActive}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AuthPage;

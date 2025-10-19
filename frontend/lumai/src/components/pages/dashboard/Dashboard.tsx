import type { User } from 'firebase/auth';

import SideNav from '../../navigation/SideNav';
import './Dashboard.css';
import UserSettingBar from './user-settings/userSettingBar';
import TwoFactorWidget from './security/TwoFactorWidget';
import SessionWidget from './security/SessionWidget';
import PrivacySettingsWidget from './privacy/PrivacySettingsWidget';
import EmailNotificationsWidget from './privacy/EmailNotificationsWidget';
import ProfileCompletionWidget from './profile/ProfileCompletionWidget';
import ProfileAnalyticsWidget from './profile/ProfileAnalyticsWidget';
import AiInsightsWidget from './profile/AiInsightsWidget';

interface DashboardProps {
  user: User;
}

const Dashboard = ({ user }: DashboardProps) => {
  const displayName = user.displayName ?? user.email ?? 'friend';
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="dashboard-shell">
      <SideNav activeKey="dashboard" />
      <div className="dashboard-canvas">
        <main className="dashboard-main" role="main">
          <UserSettingBar name={displayName} photoURL={user.photoURL ?? null} />
          <div className="dashboard-left">
            <header className="dashboard-header">
              <div>
                <p className="dashboard-subtitle">Overview · {formattedDate}</p>
                <h1 className="dashboard-title">Dashboard</h1>
                <p className="dashboard-welcome">Welcome back, {displayName}.</p>
              </div>

            </header>

            <ProfileCompletionWidget uid={user.uid} />
            <ProfileAnalyticsWidget uid={user.uid} />

            <section className="dashboard-hero" aria-labelledby="dashboard-hero-heading">
              <div className="dashboard-hero-text">
                <h2 id="dashboard-hero-heading">Complete your health profile</h2>
                <p>
                  Share a few more details about your habits and goals to unlock personalized insights powered by
                  Lumai AI.
                </p>
                <button type="button" className="dashboard-hero-action" disabled>
                  Finish profile setup
                </button>
              </div>
              <div className="dashboard-hero-art" aria-hidden="true" />
            </section>

            <section className="dashboard-placeholder" aria-live="polite">
              <p className="dashboard-placeholder-text">
                Your personalized wellness insights will appear here once you complete your profile.
              </p>
            </section>
          </div>

          <aside className="dashboard-right" aria-label="Secondary widgets">
            <PrivacySettingsWidget />
            <AiInsightsWidget />
            <EmailNotificationsWidget />
            <TwoFactorWidget />
            <SessionWidget />
            <div className="dashboard-widget">
              <h3 className="dashboard-widget-title">Calendar</h3>
              <div className="dashboard-widget-body">
                <p>Coming soon</p>
              </div>
            </div>
            <div className="dashboard-widget">
              <h3 className="dashboard-widget-title">Streak day</h3>
              <div className="dashboard-widget-body">
                <p>Coming soon</p>
              </div>
            </div>
            <div className="dashboard-widget">
              <h3 className="dashboard-widget-title">Today Tasks</h3>
              <div className="dashboard-widget-body">
                <p>Coming soon</p>
              </div>
            </div>
                    <div className="dashboard-widget">
              <h3 className="dashboard-widget-title">Tips</h3>
              <div className="dashboard-widget-body">
                <p>Profile filled?</p>
              </div>
              </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;

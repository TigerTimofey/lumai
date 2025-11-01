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
import DashboardWorkoutWidget from './workouts/DashboardWorkoutWidget';
import DashboardTasksWidget from './tasks/DashboardTasksWidget';

interface DashboardProps {
  user: User;
}

const Dashboard = ({ user }: DashboardProps) => {
  const displayName = user.displayName ?? user.email ?? 'friend';
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  const userRegisteredAt = user.metadata?.creationTime ? new Date(user.metadata.creationTime) : null;

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

            <DashboardWorkoutWidget uid={user.uid} registeredAt={userRegisteredAt} />
            <ProfileCompletionWidget uid={user.uid} />
            <ProfileAnalyticsWidget uid={user.uid} />
            <AiInsightsWidget />
            <DashboardTasksWidget />


           
          </div>

          <aside className="dashboard-right" aria-label="Secondary widgets">
            <PrivacySettingsWidget />
            <EmailNotificationsWidget />
            <TwoFactorWidget />
            <SessionWidget />

            <div className="dashboard-widget">
              <h3 className="dashboard-widget-title">Streak day</h3>
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

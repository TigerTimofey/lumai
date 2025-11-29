import type { User } from 'firebase/auth';

import SideNav from '../../navigation/SideNav';
import './Dashboard.css';
import { useCallback } from 'react';
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
import DashboardStreakWidget from './streak/DashboardStreakWidget';
import HealthSummaryWidget from './health-summary/HealthSummaryWidget';
import DailyNutritionWidget from './nutrition/DailyNutritionWidget';

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
  const handleOpenNutrition = useCallback(() => {
    window.history.pushState({}, '', '/nutrition');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

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
            <section className="calories-hero calories-hero--dashboard">
              <div>
                <p className="calories-eyebrow">Nutrition companion</p>
                <h2 className="calories-title">Meal planning hub</h2>
                <p className="calories-subtitle">
                  Explore personalized plans powered by our RAG recipe library and nutrition analytics.
                </p>
                <button type="button" className="calories-cta" onClick={handleOpenNutrition}>
                  Open nutrition workspace
                </button>
              </div>
            </section>

            <DashboardWorkoutWidget uid={user.uid} registeredAt={userRegisteredAt} />
            <DailyNutritionWidget />
            <HealthSummaryWidget uid={user.uid} />
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
            <DashboardStreakWidget uid={user.uid} />
          </aside>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;

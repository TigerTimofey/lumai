import dashboardIcon from '../../../../assets/icons/dashboard.svg';
import analyticsIcon from '../../../../assets/icons/analytics.svg';
import insightsIcon from '../../../../assets/icons/insights.svg';
import settingsIcon from '../../../../assets/icons/settings.svg';

export type TopbarNavKey = 'dashboard' | 'analytics' | 'ai-insights' | 'settings';

export const TOPBAR_NAV_ITEMS: Array<{
  key: TopbarNavKey;
  label: string;
  path: string;
  icon: string;
  aria: string;
}> = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: dashboardIcon, aria: 'Dashboard' },
  { key: 'analytics', label: 'Analytics', path: '/analytics', icon: analyticsIcon, aria: 'Analytics' },
  { key: 'ai-insights', label: 'Insights', path: '/ai-insights', icon: insightsIcon, aria: 'Insights' },
  { key: 'settings', label: 'Settings', path: '/settings', icon: settingsIcon, aria: 'Settings' }
];

import React, { useEffect, useState } from 'react';
import './SideNav.css';
import dashboardIcon from '../../assets/icons/dashboard.svg';
import profileIcon from '../../assets/icons/profile.svg';
import analyticsIcon from '../../assets/icons/analytics.svg';
import progressIcon from '../../assets/icons/progress.svg';
import insightsIcon from '../../assets/icons/insights.svg';
import settingsIcon from '../../assets/icons/settings.svg';
import leftIcon from '../../assets/icons/left.svg';
import rightIcon from '../../assets/icons/right.svg';

export type NavKey = 'dashboard' | 'profile' | 'analytics' | 'progress' | 'ai-insights' | 'settings';

export interface SideNavProps {
  activeKey?: NavKey;
  onNavigate?: (key: NavKey, path: string) => void;
  collapsed?: boolean;
}

const NAV_ITEMS: { key: NavKey; label: string; path: string }[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { key: 'profile', label: 'Profile', path: '/profile' },
  { key: 'analytics', label: 'Analytics', path: '/analytics' },
  { key: 'progress', label: 'Progress', path: '/progress' },
  { key: 'ai-insights', label: 'AI Insights', path: '/ai-insights' },
  { key: 'settings', label: 'Settings', path: '/settings' }
];

const ICONS: Record<NavKey, string> = {
  'dashboard': dashboardIcon,
  'profile': profileIcon,
  'analytics': analyticsIcon,
  'progress': progressIcon,
  'ai-insights': insightsIcon,
  'settings': settingsIcon
};

function deriveActiveKeyFromLocation(): NavKey | undefined {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const found = NAV_ITEMS.find((item) => pathname.startsWith(item.path));
  return found?.key;
}

const MOBILE_BP = 720;

const SideNav: React.FC<SideNavProps> = ({ activeKey, onNavigate, collapsed = false }) => {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return collapsed;
    return collapsed || window.innerWidth <= MOBILE_BP;
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BP);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (isMobile) setIsCollapsed(true);
  }, [isMobile]);
  const currentActive = activeKey ?? deriveActiveKeyFromLocation();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, key: NavKey, path: string) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate(key, path);
      if (isMobile) setIsCollapsed(true);
      return;
    }
    // Default navigation: push history and emit popstate so app can react if needed
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    if (isMobile) setIsCollapsed(true);
  };

  return (
    <nav className={`sidenav ${isCollapsed ? 'sidenav-collapsed' : ''}`} aria-label="Primary">
      <div className="sidenav-header">
        <span className="sidenav-brand">Lumai</span>
        <button
          type="button"
          className="sidenav-toggle"
          aria-label={isCollapsed ? 'Expand menu' : 'Collapse menu'}
          onClick={() => setIsCollapsed((v) => !v)}
        >
          <img src={isCollapsed ? rightIcon : leftIcon} alt="" aria-hidden="true" />
        </button>
      </div>
      <ul className="sidenav-list">
        {NAV_ITEMS.map((item) => (
          <li key={item.key} className={`sidenav-item ${currentActive === item.key ? 'active' : ''}`}>
            <a
              href={item.path}
              className="sidenav-link"
              onClick={(e) => handleClick(e, item.key, item.path)}
            >
              <img src={ICONS[item.key]} alt="" aria-hidden="true" className="sidenav-icon" />
              <span className="sidenav-link-label">{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default SideNav;

import React, { useEffect, useState } from 'react';
import './SideNav.css';
import { signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import dashboardIcon from '../../assets/icons/dashboard.svg';
import profileIcon from '../../assets/icons/profile.svg';
import analyticsIcon from '../../assets/icons/analytics.svg';
import insightsIcon from '../../assets/icons/insights.svg';
import logoutIcon from '../../assets/icons/logout.svg';
import leftIcon from '../../assets/icons/left.svg';
import rightIcon from '../../assets/icons/right.svg';
import logoLumai from '../../assets/icons/logo.svg';

export type NavKey = 'dashboard' | 'profile' | 'analytics' | 'ai-insights' | 'logout';

export interface SideNavProps {
  activeKey?: NavKey;
  onNavigate?: (key: NavKey, path: string) => void;
  collapsed?: boolean;
}

const NAV_ITEMS: { key: NavKey; label: string; path: string }[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { key: 'profile', label: 'Profile', path: '/profile' },
  { key: 'analytics', label: 'Analytics', path: '/analytics' },
  { key: 'ai-insights', label: 'AI Insights', path: '/ai-insights' },
  { key: 'logout', label: 'Logout', path: '#logout' }
];

const ICONS: Record<NavKey, string> = {
  'dashboard': dashboardIcon,
  'profile': profileIcon,
  'analytics': analyticsIcon,
  'ai-insights': insightsIcon,
  'logout': logoutIcon 
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
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BP);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setIsCollapsed(true);
      setMobileOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isMobile) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = mobileOpen ? 'hidden' : original;
    return () => {
      document.body.style.overflow = original;
    };
  }, [isMobile, mobileOpen]);
  const currentActive = activeKey ?? deriveActiveKeyFromLocation();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, key: NavKey, path: string) => {
    e.preventDefault();

    if (key === 'logout') {
      signOut(auth)
        .catch(() => void 0)
        .finally(() => {
          window.location.assign('/');
        });
      return;
    }

    if (onNavigate) {
      onNavigate(key, path);
      if (isMobile) {
        setIsCollapsed(true);
        setMobileOpen(false);
      }
      return;
    }
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    if (isMobile) {
      setIsCollapsed(true);
      setMobileOpen(false);
    }
  };

  return (
    <>
      {isMobile && !mobileOpen && (
        <button
          type="button"
          className="sidenav-fab"
          aria-label="Open menu"
          aria-controls="primary-sidenav"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <img src={rightIcon} alt="" aria-hidden="true" />
        </button>
      )}
      {isMobile && mobileOpen && (
        <button
          type="button"
          className="sidenav-overlay"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <nav
        id="primary-sidenav"
        className={`sidenav ${ (isMobile ? !mobileOpen : isCollapsed) ? 'sidenav-collapsed' : '' } ${isMobile && mobileOpen ? 'is-open' : ''}`}
        aria-label="Primary"
      >
      <div className="sidenav-header">
        <div className="sidenav-branding">
          <img src={logoLumai} alt="Lumai" className="sidenav-logo" />
          <span className="sidenav-brand">Lumai</span>
        </div>
        <button
          type="button"
          className="sidenav-toggle"
          aria-label={isCollapsed ? 'Expand menu' : 'Collapse menu'}
          onClick={() => (isMobile ? setMobileOpen((v) => !v) : setIsCollapsed((v) => !v))}
        >
          <img src={isMobile ? (mobileOpen ? leftIcon : rightIcon) : (isCollapsed ? rightIcon : leftIcon)} alt="" aria-hidden="true" />
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
    </>
  );
};

export default SideNav;

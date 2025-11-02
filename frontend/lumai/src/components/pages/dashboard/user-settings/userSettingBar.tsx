import React, { useEffect, useMemo, useState } from 'react';
import './userSettingBar.css';
import { TOPBAR_NAV_ITEMS, type TopbarNavKey } from './topbarNav';

interface UserSettingBarProps {
  name: string;
  photoURL?: string | null;
}

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0];
  const second = parts.length > 1 ? parts[1]?.[0] : undefined;
  return (first ?? '').concat(second ?? '').toUpperCase() || 'U';
};

const UserSettingBar: React.FC<UserSettingBarProps> = ({ name, photoURL }) => {
  const [atTop, setAtTop] = useState<boolean>(true);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setAtTop(y <= 4);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    // Set initial state on mount
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll as EventListener);
  }, []);

  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/dashboard';
  const activeKey: TopbarNavKey | undefined = useMemo(() => {
    const match = TOPBAR_NAV_ITEMS.find((item) => currentPath.startsWith(item.path));
    return match?.key;
  }, [currentPath]);

  return (
    <div className={"user-setting-bar" + (atTop ? '' : ' is-hidden')} role="banner" aria-hidden={atTop ? undefined : true}>
      <div className="topbar-actions">
        {TOPBAR_NAV_ITEMS.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`icon-button${isActive ? ' is-active' : ''}`}
              aria-label={item.aria}
              aria-pressed={isActive}
              onClick={() => {
                if (window.location.pathname !== item.path) {
                  window.history.pushState({}, '', item.path);
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }
              }}
            >
              <img src={item.icon} alt="" aria-hidden="true" />
            </button>
          );
        })}
        <div className="topbar-user" aria-label={`Signed in as ${name}`}>
          {photoURL ? (
            <img className="topbar-avatar topbar-avatar-img" src={photoURL} alt="" aria-hidden="true" />
          ) : (
            <div className="topbar-avatar" aria-hidden="true">{getInitials(name)}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserSettingBar;

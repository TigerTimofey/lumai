import React, { useEffect, useState } from 'react';
import insightsIcon from '../../../../assets/icons/profile.svg';
import analyticsIcon from '../../../../assets/icons/analytics.svg';
import settingsIcon from '../../../../assets/icons/settings.svg';
import './userSettingBar.css';

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

  return (
    <div className={"user-setting-bar" + (atTop ? '' : ' is-hidden')} role="banner" aria-hidden={atTop ? undefined : true}>
      <div className="topbar-actions">
        <button type="button" className="icon-button" aria-label="Insights" disabled>
          <img src={insightsIcon} alt="" aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label="Analytics" disabled>
          <img src={analyticsIcon} alt="" aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label="Settings" disabled>
          <img src={settingsIcon} alt="" aria-hidden="true" />
        </button>
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

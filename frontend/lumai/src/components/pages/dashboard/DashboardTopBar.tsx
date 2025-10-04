import React from 'react';
import insightsIcon from '../../../assets/icons/insights.svg';
import analyticsIcon from '../../../assets/icons/analytics.svg';
import settingsIcon from '../../../assets/icons/settings.svg';
import './DashboardTopBar.css';

interface DashboardTopBarProps {
  name: string;
}

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0];
  const second = parts.length > 1 ? parts[1]?.[0] : undefined;
  return (first ?? '').concat(second ?? '').toUpperCase() || 'U';
};

const DashboardTopBar: React.FC<DashboardTopBarProps> = ({ name }) => {
  return (
    <div className="dashboard-topbar" role="banner">
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
          <div className="topbar-avatar" aria-hidden="true">{getInitials(name)}</div>
          <span className="topbar-username">{name}</span>
        </div>
      </div>
    </div>
  );
};

export default DashboardTopBar;

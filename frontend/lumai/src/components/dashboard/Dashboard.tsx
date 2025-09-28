import type { User } from 'firebase/auth';
import './Dashboard.css';

interface DashboardProps {
  user: User;
}

const Dashboard = ({ user }: DashboardProps) => {
  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Dashboard</h1>
      <p className="dashboard-welcome">Welcome, {user.displayName ?? user.email ?? 'friend'}!</p>
    </div>
  );
};

export default Dashboard;

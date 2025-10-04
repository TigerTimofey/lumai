import type { User } from 'firebase/auth';
import './Dashboard.css';
import SideNav from '../navigation/SideNav';

interface DashboardProps {
  user: User;
}

const Dashboard = ({ user }: DashboardProps) => {
  return (
    <>
      <SideNav activeKey="dashboard" />
      <main className="dashboard-main">
        <div className="dashboard">
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-welcome">Welcome, {user.displayName ?? user.email ?? 'friend'}!</p>
        </div>
      </main>
    </>
  );
};

export default Dashboard;

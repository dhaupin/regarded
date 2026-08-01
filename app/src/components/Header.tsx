import { Link } from 'react-router-dom';
import { useAuthProvider } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  FileProtectOutlined,
  SwapOutlined,
  WalletOutlined,
  SettingOutlined,
  LogoutOutlined,
} from '@ant-design/icons';

const { Header: AntHeader } = Layout;

export function Header() {
  const { logout, isAuthenticated } = useAuthProvider();

  if (!isAuthenticated) {
    return (
      <AntHeader className="flex items-center justify-between px-6 bg-white border-b">
        <Link to="/" className="text-xl font-bold">
          Regarded
        </Link>
        <Link to="/login">
          <Button variant="ghost">Login</Button>
        </Link>
      </AntHeader>
    );
  }

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: <Link to="/dashboard">Dashboard</Link> },
    { key: '/connectors', icon: <ApiOutlined />, label: <Link to="/connectors">Connectors</Link> },
    { key: '/strategies', icon: <ThunderboltOutlined />, label: <Link to="/strategies">Strategies</Link> },
    { key: '/rules', icon: <FileProtectOutlined />, label: <Link to="/rules">Rules</Link> },
    { key: '/trades', icon: <SwapOutlined />, label: <Link to="/trades">Trades</Link> },
    { key: '/positions', icon: <WalletOutlined />, label: <Link to="/positions">Positions</Link> },
    { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Settings</Link> },
  ];

  return (
    <AntHeader className="flex items-center justify-between px-6 bg-white border-b" style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <Link to="/" className="text-xl font-bold text-primary">
          Regarded
        </Link>
        <Menu 
          mode="horizontal" 
          items={menuItems} 
          style={{ border: 'none', minWidth: '400px' }}
          selectable={false}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Button 
          variant="ghost" 
          onClick={logout}
        >
          <LogoutOutlined style={{ marginRight: '8px' }} />
          Logout
        </Button>
      </div>
    </AntHeader>
  );
}

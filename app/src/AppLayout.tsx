import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import {
  Login,
  Dashboard,
  ConnectorsList,
  ConnectorsCreate,
  ConnectorsEdit,
  StrategiesList,
  StrategiesCreate,
  StrategiesEdit,
  RulesList,
  RulesCreate,
  RulesEdit,
  TradesList,
  Settings,
} from './pages';
import { Header } from './components/Header';

const { Content, Footer } = Layout;

// AppLayout - for SSR/prerender (no BrowserRouter)
// The BrowserRouter is in main.tsx for client-side routing
export function AppLayout() {
  return (
    <Layout className="min-h-screen">
      <Header />
      <Content className="p-6">
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          
          <Route path="/connectors" element={<ConnectorsList />} />
          <Route path="/connectors/create" element={<ConnectorsCreate />} />
          <Route path="/connectors/:id" element={<ConnectorsEdit />} />
          
          <Route path="/strategies" element={<StrategiesList />} />
          <Route path="/strategies/create" element={<StrategiesCreate />} />
          <Route path="/strategies/:id" element={<StrategiesEdit />} />
          
          <Route path="/rules" element={<RulesList />} />
          <Route path="/rules/create" element={<RulesCreate />} />
          <Route path="/rules/:id" element={<RulesEdit />} />
          
          <Route path="/trades" element={<TradesList />} />
          <Route path="/settings" element={<Settings />} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Content>
      <Footer className="text-center">
        Regarded ©{new Date().getFullYear()} - Crypto Trading Agent Platform
      </Footer>
    </Layout>
  );
}

export default AppLayout;

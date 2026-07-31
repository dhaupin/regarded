import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import { useAuthProvider } from './hooks/useAuth';
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

function App() {
  const { isAuthenticated } = useAuthProvider();

  return (
    <Layout className="min-h-screen">
      <Header />
      <Content className="p-6">
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/dashboard" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
          
          <Route path="/connectors" element={isAuthenticated ? <ConnectorsList /> : <Navigate to="/login" />} />
          <Route path="/connectors/create" element={isAuthenticated ? <ConnectorsCreate /> : <Navigate to="/login" />} />
          <Route path="/connectors/:id" element={isAuthenticated ? <ConnectorsEdit /> : <Navigate to="/login" />} />
          
          <Route path="/strategies" element={isAuthenticated ? <StrategiesList /> : <Navigate to="/login" />} />
          <Route path="/strategies/create" element={isAuthenticated ? <StrategiesCreate /> : <Navigate to="/login" />} />
          <Route path="/strategies/:id" element={isAuthenticated ? <StrategiesEdit /> : <Navigate to="/login" />} />
          
          <Route path="/rules" element={isAuthenticated ? <RulesList /> : <Navigate to="/login" />} />
          <Route path="/rules/create" element={isAuthenticated ? <RulesCreate /> : <Navigate to="/login" />} />
          <Route path="/rules/:id" element={isAuthenticated ? <RulesEdit /> : <Navigate to="/login" />} />
          
          <Route path="/trades" element={isAuthenticated ? <TradesList /> : <Navigate to="/login" />} />
          <Route path="/settings" element={isAuthenticated ? <Settings /> : <Navigate to="/login" />} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Content>
      <Footer className="text-center">
        Regarded ©{new Date().getFullYear()} - Crypto Trading Agent Platform
      </Footer>
    </Layout>
  );
}

export default App;

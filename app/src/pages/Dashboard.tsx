import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthProvider } from '@/hooks/useAuth';
import { Row, Col, Switch, Spin } from 'antd';
import {
  WalletOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  FileProtectOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { apiGet, apiPost } from '@/lib/api';

interface AgentStatus {
  running: boolean;
  positions: number;
  trades_today: number;
  pnl_today: number;
  tick_interval?: number;
}

export function Dashboard() {
  const { user } = useAuthProvider();
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchAgentStatus = async () => {
    try {
      const data = await apiGet<AgentStatus>('/agent/status');
      setAgentStatus(data);
    } catch (error) {
      console.error('Failed to fetch agent status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentStatus();
  }, []);

  const handleToggleAgent = async () => {
    if (!agentStatus) return;
    
    setToggling(true);
    const action = agentStatus.running ? 'stop' : 'start';
    
    try {
      const data = await apiPost<{ running: boolean }>(`/agent/${action}`, { tick_interval: 60000 });
      setAgentStatus({
        ...agentStatus,
        running: data.running,
      });
    } catch (error) {
      console.error('Failed to toggle agent:', error);
    } finally {
      setToggling(false);
    }
  };

  const isRunning = agentStatus?.running ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.name || 'Trader'}
        </p>
      </div>

      {/* Agent Control Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ThunderboltOutlined />
              Trading Agent
            </CardTitle>
            <CardDescription>
              Control your automated trading agent
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            {loading ? (
              <Spin />
            ) : (
              <>
                <Badge variant={isRunning ? 'success' : 'secondary'}>
                  {isRunning ? 'Running' : 'Stopped'}
                </Badge>
                <Switch
                  checked={isRunning}
                  onChange={handleToggleAgent}
                  loading={toggling}
                  checkedChildren={<PlayCircleOutlined />}
                  unCheckedChildren={<StopOutlined />}
                />
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">
              <Spin />
            </div>
          ) : (
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <div className="text-center">
                  <div className="text-2xl font-bold">{agentStatus?.positions ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Open Positions</p>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div className="text-center">
                  <div className="text-2xl font-bold">{agentStatus?.trades_today ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Trades Today</p>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${(agentStatus?.pnl_today ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${(agentStatus?.pnl_today ?? 0).toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground">P&L Today</p>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div className="text-center">
                  <div className="text-2xl font-bold">{(agentStatus?.tick_interval ?? 60000) / 1000}s</div>
                  <p className="text-xs text-muted-foreground">Tick Interval</p>
                </div>
              </Col>
            </Row>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
              <WalletOutlined className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$0.00</div>
              <p className="text-xs text-muted-foreground">
                No active positions
              </p>
            </CardContent>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Strategies</CardTitle>
              <ThunderboltOutlined className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                No strategies running
              </p>
            </CardContent>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Connectors</CardTitle>
              <ApiOutlined className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                No exchanges connected
              </p>
            </CardContent>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Rules</CardTitle>
              <FileProtectOutlined className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                No rules configured
              </p>
            </CardContent>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card>
            <CardHeader>
              <CardTitle>Quick Start</CardTitle>
              <CardDescription>
                Get started by connecting an exchange and creating your first strategy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <a
                  href="/connectors/create"
                  className="flex flex-col items-center justify-center rounded-lg border p-6 hover:bg-accent transition-colors"
                >
                  <ApiOutlined className="h-8 w-8 mb-2" />
                  <span className="font-medium">Connect Exchange</span>
                </a>
                <a
                  href="/strategies/create"
                  className="flex flex-col items-center justify-center rounded-lg border p-6 hover:bg-accent transition-colors"
                >
                  <ThunderboltOutlined className="h-8 w-8 mb-2" />
                  <span className="font-medium">Create Strategy</span>
                </a>
              </div>
            </CardContent>
          </Card>
        </Col>
        
        <Col xs={24} lg={8}>
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                No recent activity
              </p>
            </CardContent>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default Dashboard;

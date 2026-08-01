import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthProvider } from '@/hooks/useAuth';
import { Row, Col } from 'antd';
import {
  WalletOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  FileProtectOutlined,
} from '@ant-design/icons';

export function Dashboard() {
  const { user } = useAuthProvider();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.name || 'Trader'}
        </p>
      </div>

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

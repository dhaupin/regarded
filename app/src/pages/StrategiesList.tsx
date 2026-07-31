import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusOutlined, ThunderboltOutlined, EditOutlined } from '@ant-design/icons';

export function StrategiesList() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Strategies</h1>
          <p className="text-muted-foreground">
            Manage your trading strategies
          </p>
        </div>
        <Link to="/strategies/create">
          <Button>
            <PlusOutlined className="mr-2" />
            Create Strategy
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="py-10 text-center">
          <ThunderboltOutlined className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No strategies yet</p>
          <Link to="/strategies/create">
            <Button variant="outline" className="mt-4">
              Create your first strategy
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export function StrategiesCreate() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Create Strategy</h1>
      <Card>
        <CardHeader>
          <CardTitle>Strategy Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Strategy form coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function StrategiesEdit() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Edit Strategy</h1>
      <Card>
        <CardHeader>
          <CardTitle>Strategy Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Strategy form coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default StrategiesList;

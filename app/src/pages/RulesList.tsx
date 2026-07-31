import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusOutlined, FileProtectOutlined } from '@ant-design/icons';

export function RulesList() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Rules</h1>
          <p className="text-muted-foreground">
            Configure trading rules and risk management
          </p>
        </div>
        <Link to="/rules/create">
          <Button>
            <PlusOutlined className="mr-2" />
            Create Rule
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="py-10 text-center">
          <FileProtectOutlined className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No rules configured</p>
          <Link to="/rules/create">
            <Button variant="outline" className="mt-4">
              Create your first rule
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export function RulesCreate() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Create Rule</h1>
      <Card>
        <CardHeader>
          <CardTitle>Rule Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Rule form coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function RulesEdit() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Edit Rule</h1>
      <Card>
        <CardHeader>
          <CardTitle>Rule Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Rule form coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default RulesList;

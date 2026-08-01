import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined } from '@ant-design/icons';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Connector {
  id: string;
  exchange: string;
  label: string;
  paper: boolean;
  status: string;
}

export function ConnectorsList() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/connectors`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setConnectors(data.data?.items || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Connectors</h1>
          <p className="text-muted-foreground">
            Manage your exchange connections
          </p>
        </div>
        <Link to="/connectors/create">
          <Button>
            <PlusOutlined className="mr-2" />
            Add Connector
          </Button>
        </Link>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center">
            Loading...
          </CardContent>
        </Card>
      ) : connectors.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ApiOutlined className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No connectors yet</p>
            <Link to="/connectors/create">
              <Button variant="outline" className="mt-4">
                Add your first connector
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {connectors.map((connector) => (
            <Card key={connector.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg">{connector.exchange}</CardTitle>
                <span className={`text-xs px-2 py-1 rounded ${
                  connector.status === 'connected' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {connector.status}
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{connector.label}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {connector.paper ? 'Paper Trading' : 'Live Trading'}
                </p>
                <div className="flex gap-2 mt-4">
                  <Link to={`/connectors/${connector.id}`}>
                    <Button variant="outline" size="sm">
                      <EditOutlined />
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" className="text-destructive">
                    <DeleteOutlined />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default ConnectorsList;

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Spin, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { message } from 'antd';

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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modeFilter, setModeFilter] = useState<string>('all');

  const fetchConnectors = () => {
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
  };

  useEffect(() => {
    fetchConnectors();
  }, []);

  const filteredConnectors = useMemo(() => {
    return connectors.filter(connector => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        connector.label.toLowerCase().includes(searchLower) ||
        connector.exchange.toLowerCase().includes(searchLower);
      
      // Status filter
      const matchesStatus = statusFilter === 'all' || connector.status === statusFilter;
      
      // Mode filter (paper vs live)
      const matchesMode = modeFilter === 'all' || 
        (modeFilter === 'paper' && connector.paper) ||
        (modeFilter === 'live' && !connector.paper);
      
      return matchesSearch && matchesStatus && matchesMode;
    });
  }, [connectors, search, statusFilter, modeFilter]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/connectors/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });
      
      if (res.ok) {
        message.success('Connector deleted');
        setConnectors(connectors.filter(c => c.id !== id));
      } else {
        message.error('Failed to delete connector');
      }
    } catch {
      message.error('Failed to delete connector');
    }
  };

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

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <Input
          placeholder="Search connectors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          
        />
        <Select
          placeholder="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: 'All Status' },
            { value: 'connected', label: 'Connected' },
            { value: 'disconnected', label: 'Disconnected' },
          ]}
        />
        <Select
          placeholder="Mode"
          value={modeFilter}
          onChange={setModeFilter}
          style={{ width: 140 }}
          options={[
            { value: 'all', label: 'All Modes' },
            { value: 'paper', label: 'Paper Trading' },
            { value: 'live', label: 'Live Trading' },
          ]}
        />
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredConnectors.length} of {connectors.length} connectors
        </span>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Spin size="large" />
          </CardContent>
        </Card>
      ) : filteredConnectors.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ApiOutlined className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search || statusFilter !== 'all' || modeFilter !== 'all' 
                ? 'No connectors match your filters' 
                : 'No connectors yet'}
            </p>
            {!search && statusFilter === 'all' && modeFilter === 'all' && (
              <Link to="/connectors/create">
                <Button variant="outline" className="mt-4">
                  Add your first connector
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredConnectors.map((connector) => (
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
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive">
                        <DeleteOutlined />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          <ExclamationCircleOutlined style={{ marginRight: 8 }} />
                          Delete Connector
                        </DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete "{connector.label || connector.exchange}"? 
                          This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => {}}>
                          Cancel
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={() => handleDelete(connector.id)}
                        >
                          Delete
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
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

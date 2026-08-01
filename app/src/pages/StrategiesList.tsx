import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Spin, Select } from 'antd';
import { PlusOutlined, ThunderboltOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { message } from 'antd';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Strategy {
  id: string;
  name: string;
  symbols: string[];
  intervals: string[];
  enabled: boolean;
}

export function StrategiesList() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchStrategies = () => {
    fetch(`${API_URL}/strategies`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setStrategies(data.data?.items || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  const filteredStrategies = useMemo(() => {
    return strategies.filter(strategy => {
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        strategy.name.toLowerCase().includes(searchLower) ||
        strategy.symbols?.some(s => s.toLowerCase().includes(searchLower));
      
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'enabled' && strategy.enabled) ||
        (statusFilter === 'disabled' && !strategy.enabled);
      
      return matchesSearch && matchesStatus;
    });
  }, [strategies, search, statusFilter]);

  const handleDelete = async (id: string, _name: string) => {
    try {
      const res = await fetch(`${API_URL}/strategies/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });
      
      if (res.ok) {
        message.success('Strategy deleted');
        setStrategies(strategies.filter(s => s.id !== id));
      } else {
        message.error('Failed to delete strategy');
      }
    } catch {
      message.error('Failed to delete strategy');
    }
  };

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

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <Input
          placeholder="Search strategies..."
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
            { value: 'enabled', label: 'Enabled' },
            { value: 'disabled', label: 'Disabled' },
          ]}
        />
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredStrategies.length} of {strategies.length} strategies
        </span>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Spin size="large" />
          </CardContent>
        </Card>
      ) : filteredStrategies.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ThunderboltOutlined className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search || statusFilter !== 'all' 
                ? 'No strategies match your filters' 
                : 'No strategies yet'}
            </p>
            {!search && statusFilter === 'all' && (
              <Link to="/strategies/create">
                <Button variant="outline" className="mt-4">
                  Create your first strategy
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredStrategies.map((strategy) => (
            <Card key={strategy.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg">{strategy.name}</CardTitle>
                <span className={`text-xs px-2 py-1 rounded ${
                  strategy.enabled 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {strategy.enabled ? 'Active' : 'Disabled'}
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {strategy.symbols?.join(', ') || 'No symbols'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Intervals: {strategy.intervals?.join(', ') || 'None'}
                </p>
                <div className="flex gap-2 mt-4">
                  <Link to={`/strategies/${strategy.id}`}>
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
                          Delete Strategy
                        </DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete "{strategy.name}"? 
                          This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => {}}>
                          Cancel
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={() => handleDelete(strategy.id, strategy.name)}
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

export default StrategiesList;

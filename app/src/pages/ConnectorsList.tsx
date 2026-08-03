import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Key, AlertCircle } from 'lucide-react';
import { apiGet, apiDelete } from '@/lib/api';

interface Connector {
  id: string;
  exchange: string;
  label: string;
  paper: boolean;
  status: string;
}

export function ConnectorsList() {
  const { toast } = useToast();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchConnectors = async () => {
    try {
      const data = await apiGet<{ items: Connector[] }>('/connectors');
      setConnectors(data.items || []);
    } catch (error) {
      console.error('Failed to fetch connectors:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnectors();
  }, []);

  const filteredConnectors = useMemo(() => {
    return connectors.filter(connector => {
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        connector.label.toLowerCase().includes(searchLower) ||
        connector.exchange.toLowerCase().includes(searchLower);
      
      const matchesStatus = statusFilter === 'all' || connector.status === statusFilter;
      
      const matchesMode = modeFilter === 'all' || 
        (modeFilter === 'paper' && connector.paper) ||
        (modeFilter === 'live' && !connector.paper);
      
      return matchesSearch && matchesStatus && matchesMode;
    });
  }, [connectors, search, statusFilter, modeFilter]);

  const allSelected = filteredConnectors.length > 0 && selectedIds.length === filteredConnectors.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredConnectors.map(c => c.id));
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/connectors/${id}`);
      toast({ title: 'Success', description: 'Connector deleted', variant: 'success' });
      setConnectors(connectors.filter(c => c.id !== id));
      setSelectedIds(prev => prev.filter(i => i !== id));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete connector', variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    const results = await Promise.all(
      selectedIds.map(async (id) => {
        try {
          await apiDelete(`/connectors/${id}`);
          return true;
        } catch {
          return false;
        }
      })
    );

    const successCount = results.filter(r => r).length;
    if (successCount > 0) {
      toast({ title: 'Success', description: `Deleted ${successCount} connector(s)`, variant: 'success' });
      setConnectors(connectors.filter(c => !selectedIds.includes(c.id)));
      setSelectedIds([]);
    } else {
      toast({ title: 'Error', description: 'Failed to delete connectors', variant: 'destructive' });
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
            <Plus className="mr-2 h-4 w-4" />
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="connected">Connected</SelectItem>
            <SelectItem value="disconnected">Disconnected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="paper">Paper Trading</SelectItem>
            <SelectItem value="live">Live Trading</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredConnectors.length} of {connectors.length} connectors
        </span>
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
          <Checkbox
            checked={allSelected}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm">
            {selectedIds.length} selected
          </span>
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={handleBulkDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selected
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setSelectedIds([])}
          >
            Clear Selection
          </Button>
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Loading text="Loading connectors..." />
          </CardContent>
        </Card>
      ) : filteredConnectors.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
            <Card key={connector.id} className={selectedIds.includes(connector.id) ? 'ring-2 ring-primary' : ''}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.includes(connector.id)}
                    onCheckedChange={() => handleSelectOne(connector.id)}
                  />
                  <CardTitle className="text-lg">{connector.exchange}</CardTitle>
                </div>
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
                      <Edit className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          <AlertCircle className="inline h-4 w-4 mr-2" />
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

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
import { Plus, Zap, Edit, Trash2, AlertCircle } from 'lucide-react';
import { apiGet, apiPut, apiDelete } from '@/lib/api';

interface Strategy {
  id: string;
  name: string;
  symbols: string[];
  intervals: string[];
  enabled: boolean;
}

export function StrategiesList() {
  const { toast } = useToast();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchStrategies = async () => {
    try {
      const data = await apiGet<{ items: Strategy[] }>('/strategies');
      setStrategies(data.items || []);
    } catch (error) {
      console.error('Failed to fetch strategies:', error);
    } finally {
      setLoading(false);
    }
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

  const allSelected = filteredStrategies.length > 0 && selectedIds.length === filteredStrategies.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredStrategies.map(s => s.id));
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleDelete = async (id: string, _name: string) => {
    try {
      await apiDelete(`/strategies/${id}`);
      toast({ title: 'Success', description: 'Strategy deleted', variant: 'success' });
      setStrategies(strategies.filter(s => s.id !== id));
      setSelectedIds(prev => prev.filter(i => i !== id));
    } catch {
      toast({ title: 'Error', description: 'Failed to delete strategy', variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    const results = await Promise.all(
      selectedIds.map(async (id) => {
        try {
          await apiDelete(`/strategies/${id}`);
          return true;
        } catch {
          return false;
        }
      })
    );

    const successCount = results.filter(r => r).length;
    if (successCount > 0) {
      toast({ title: 'Success', description: `Deleted ${successCount} strategy(s)`, variant: 'success' });
      setStrategies(strategies.filter(s => !selectedIds.includes(s.id)));
      setSelectedIds([]);
    } else {
      toast({ title: 'Error', description: 'Failed to delete strategies', variant: 'destructive' });
    }
  };

  const handleBulkToggle = async (enable: boolean) => {
    const results = await Promise.all(
      selectedIds.map(async (id) => {
        try {
          await apiPut(`/strategies/${id}`, { enabled: enable });
          return true;
        } catch {
          return false;
        }
      })
    );

    const successCount = results.filter(r => r).length;
    if (successCount > 0) {
      toast({ title: 'Success', description: `${enable ? 'Enabled' : 'Disabled'} ${successCount} strategy(s)`, variant: 'success' });
      setStrategies(strategies.map(s => 
        selectedIds.includes(s.id) ? { ...s, enabled: enable } : s
      ));
      setSelectedIds([]);
    } else {
      toast({ title: 'Error', description: 'Failed to update strategies', variant: 'destructive' });
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
            <Plus className="mr-2 h-4 w-4" />
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredStrategies.length} of {strategies.length} strategies
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
            variant="default" 
            size="sm" 
            onClick={() => handleBulkToggle(true)}
          >
            Enable Selected
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleBulkToggle(false)}
          >
            Disable Selected
          </Button>
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
            <Loading text="Loading strategies..." />
          </CardContent>
        </Card>
      ) : filteredStrategies.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
            <Card key={strategy.id} className={selectedIds.includes(strategy.id) ? 'ring-2 ring-primary' : ''}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.includes(strategy.id)}
                    onChange={() => handleSelectOne(strategy.id)}
                  />
                  <CardTitle className="text-lg">{strategy.name}</CardTitle>
                </div>
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

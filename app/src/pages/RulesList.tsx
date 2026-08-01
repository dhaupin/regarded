import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Spin, Select, Checkbox } from 'antd';
import { PlusOutlined, FileProtectOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { message } from 'antd';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Rule {
  id: string;
  name: string;
  condition_logic: string;
  trigger_type?: string;
  enabled: boolean;
  conditions?: unknown[];
}

export function RulesList() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchRules = () => {
    fetch(`${API_URL}/rules`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setRules(data.data?.items || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const filteredRules = useMemo(() => {
    return rules.filter(rule => {
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        rule.name.toLowerCase().includes(searchLower) ||
        rule.trigger_type?.toLowerCase().includes(searchLower);
      
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'enabled' && rule.enabled) ||
        (statusFilter === 'disabled' && !rule.enabled);
      
      return matchesSearch && matchesStatus;
    });
  }, [rules, search, statusFilter]);

  const allSelected = filteredRules.length > 0 && selectedIds.length === filteredRules.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < filteredRules.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRules.map(r => r.id));
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
      const res = await fetch(`${API_URL}/rules/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });
      
      if (res.ok) {
        message.success('Rule deleted');
        setRules(rules.filter(r => r.id !== id));
        setSelectedIds(prev => prev.filter(i => i !== id));
      } else {
        message.error('Failed to delete rule');
      }
    } catch {
      message.error('Failed to delete rule');
    }
  };

  const handleBulkDelete = async () => {
    const results = await Promise.all(
      selectedIds.map(async (id) => {
        const res = await fetch(`${API_URL}/rules/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          },
        });
        return res.ok;
      })
    );

    const successCount = results.filter(r => r).length;
    if (successCount > 0) {
      message.success(`Deleted ${successCount} rule(s)`);
      setRules(rules.filter(r => !selectedIds.includes(r.id)));
      setSelectedIds([]);
    } else {
      message.error('Failed to delete rules');
    }
  };

  const handleBulkToggle = async (enable: boolean) => {
    const results = await Promise.all(
      selectedIds.map(async (id) => {
        const res = await fetch(`${API_URL}/rules/${id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ enabled: enable }),
        });
        return res.ok;
      })
    );

    const successCount = results.filter(r => r).length;
    if (successCount > 0) {
      message.success(`${enable ? 'Enabled' : 'Disabled'} ${successCount} rule(s)`);
      setRules(rules.map(r => 
        selectedIds.includes(r.id) ? { ...r, enabled: enable } : r
      ));
      setSelectedIds([]);
    } else {
      message.error('Failed to update rules');
    }
  };

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

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <Input
          placeholder="Search rules..."
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
          {filteredRules.length} of {rules.length} rules
        </span>
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={handleSelectAll}
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
            <DeleteOutlined className="mr-2" />
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
            <Spin size="large" />
          </CardContent>
        </Card>
      ) : filteredRules.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FileProtectOutlined className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search || statusFilter !== 'all' 
                ? 'No rules match your filters' 
                : 'No rules configured'}
            </p>
            {!search && statusFilter === 'all' && (
              <Link to="/rules/create">
                <Button variant="outline" className="mt-4">
                  Create your first rule
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRules.map((rule) => (
            <Card key={rule.id} className={selectedIds.includes(rule.id) ? 'ring-2 ring-primary' : ''}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.includes(rule.id)}
                    onChange={() => handleSelectOne(rule.id)}
                  />
                  <CardTitle className="text-lg">{rule.name}</CardTitle>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  rule.enabled 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {rule.enabled ? 'Active' : 'Disabled'}
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Trigger: {rule.trigger_type || 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Logic: {rule.condition_logic || 'and'} | Conditions: {rule.conditions?.length || 0}
                </p>
                <div className="flex gap-2 mt-4">
                  <Link to={`/rules/${rule.id}`}>
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
                          Delete Rule
                        </DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete "{rule.name}"? 
                          This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => {}}>
                          Cancel
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={() => handleDelete(rule.id, rule.name)}
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

export default RulesList;

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import { apiGet, apiPut } from '@/lib/api';

export function RulesEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    condition_logic: 'and',
    trigger_type: '',
    enabled: true,
  });

  useEffect(() => {
    const fetchRule = async () => {
      try {
        const data = await apiGet<{ data: { name: string; condition_logic: string; trigger_type: string; enabled: boolean } }>(`/rules/${id}`);
        if (data?.data) {
          setFormData({
            name: data.data.name || '',
            condition_logic: data.data.condition_logic || 'and',
            trigger_type: data.data.trigger_type || '',
            enabled: data.data.enabled ?? true,
          });
        }
      } catch (error) {
        console.error(error);
        toast({ title: 'Error', description: 'Failed to load rule', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchRule();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPut(`/rules/${id}`, formData);
      toast({ title: 'Success', description: 'Rule updated successfully', variant: 'success' });
      navigate('/rules');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update rule', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/rules')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Rule</h1>
          <p className="text-muted-foreground">
            Update your trading rule
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Rule Details</CardTitle>
            <CardDescription>
              Modify the rule settings below
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter rule name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="condition_logic">Condition Logic</Label>
              <Select
                value={formData.condition_logic}
                onValueChange={(value) => setFormData({ ...formData, condition_logic: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select logic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="and">AND</SelectItem>
                  <SelectItem value="or">OR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="trigger_type">Trigger Type</Label>
              <Select
                value={formData.trigger_type}
                onValueChange={(value) => setFormData({ ...formData, trigger_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select trigger type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trade">Trade</SelectItem>
                  <SelectItem value="notify">Notify</SelectItem>
                  <SelectItem value="adjust_risk">Adjust Risk</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
              <Label htmlFor="enabled">Enabled</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => navigate('/rules')}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default RulesEdit;

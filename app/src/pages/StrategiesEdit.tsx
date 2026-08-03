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

const intervalOptions = ['1m', '5m', '15m', '1h', '4h', '1d'];

export function StrategiesEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    symbols: '',
    intervals: [] as string[],
    enabled: true,
  });

  useEffect(() => {
    const fetchStrategy = async () => {
      try {
        const data = await apiGet<{ data: { name: string; symbols: string[]; intervals: string[]; enabled: boolean } }>(`/strategies/${id}`);
        if (data?.data) {
          setFormData({
            name: data.data.name || '',
            symbols: Array.isArray(data.data.symbols) ? data.data.symbols.join(',') : '',
            intervals: data.data.intervals || [],
            enabled: data.data.enabled ?? true,
          });
        }
      } catch (error) {
        console.error(error);
        toast({ title: 'Error', description: 'Failed to load strategy', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchStrategy();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPut(`/strategies/${id}`, {
        ...formData,
        symbols: formData.symbols.split(',').map(s => s.trim()).filter(Boolean),
      });
      toast({ title: 'Success', description: 'Strategy updated successfully', variant: 'success' });
      navigate('/strategies');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update strategy', variant: 'destructive' });
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
        <Button variant="ghost" size="sm" onClick={() => navigate('/strategies')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Strategy</h1>
          <p className="text-muted-foreground">
            Update your trading strategy
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Strategy Details</CardTitle>
            <CardDescription>
              Modify the strategy settings below
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter strategy name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="symbols">Symbols</Label>
              <Input
                id="symbols"
                value={formData.symbols}
                onChange={(e) => setFormData({ ...formData, symbols: e.target.value })}
                placeholder="BTC/USD,ETH/USD"
              />
              <p className="text-sm text-muted-foreground">Comma-separated trading pairs</p>
            </div>

            <div className="space-y-2">
              <Label>Intervals</Label>
              <div className="flex flex-wrap gap-2">
                {intervalOptions.map((interval) => (
                  <label
                    key={interval}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      formData.intervals.includes(interval)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.intervals.includes(interval)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, intervals: [...formData.intervals, interval] });
                        } else {
                          setFormData({ ...formData, intervals: formData.intervals.filter(i => i !== interval) });
                        }
                      }}
                      className="sr-only"
                    />
                    {interval}
                  </label>
                ))}
              </div>
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
              <Button variant="outline" onClick={() => navigate('/strategies')}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default StrategiesEdit;

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from 'antd';
import { message } from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import { apiPost } from '@/lib/api';

interface FormErrors {
  name?: string;
  symbols?: string;
}

export function StrategiesCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState({
    name: '',
    symbols: '',
    intervals: [] as string[],
    enabled: true,
  });

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Strategy name is required';
    }
    
    if (!formData.symbols.trim()) {
      newErrors.symbols = 'At least one symbol is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) {
      message.error('Please fix the errors above');
      return;
    }
    
    setLoading(true);

    try {
      const data = await apiPost<{ success: boolean; error?: { message: string } }>('/strategies', {
        name: formData.name,
        symbols: formData.symbols.split(',').map(s => s.trim()).filter(Boolean),
        intervals: formData.intervals,
        enabled: formData.enabled,
      });
      
      if (data.success) {
        message.success('Strategy created successfully');
        navigate('/strategies');
      } else {
        message.error(data.error?.message || 'Failed to create strategy');
      }
    } catch (error) {
      message.error('Failed to create strategy');
    } finally {
      setLoading(false);
    }
  };

  const intervalOptions = ['1m', '5m', '15m', '1h', '4h', '1d'];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button 
          type="text" 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate('/strategies')}
        >
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Strategy</h1>
          <p className="text-muted-foreground">
            Create a new trading strategy
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Strategy Details</CardTitle>
            <CardDescription>
              Configure your trading strategy
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="My Trading Strategy"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: undefined });
                }}
                className={errors.name ? 'border-red-500' : undefined}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="symbols">Symbols *</Label>
              <Input
                id="symbols"
                placeholder="BTC/USD, ETH/USD (comma separated)"
                value={formData.symbols}
                onChange={(e) => {
                  setFormData({ ...formData, symbols: e.target.value });
                  if (errors.symbols) setErrors({ ...errors, symbols: undefined });
                }}
                className={errors.symbols ? 'border-red-500' : undefined}
              />
              {errors.symbols && (
                <p className="text-sm text-red-500">{errors.symbols}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Intervals</Label>
              <div className="flex flex-wrap gap-2">
                {intervalOptions.map((interval) => (
                  <Button
                    key={interval}
                    type={formData.intervals.includes(interval) ? 'primary' : 'default'}
                    size="small"
                    onClick={() => {
                      const newIntervals = formData.intervals.includes(interval)
                        ? formData.intervals.filter(i => i !== interval)
                        : [...formData.intervals, interval];
                      setFormData({ ...formData, intervals: newIntervals });
                    }}
                  >
                    {interval}
                  </Button>
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
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={loading}>
                Create Strategy
              </Button>
              <Button variant="outlined" onClick={() => navigate('/strategies')}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default StrategiesCreate;

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, CheckCircle, XCircle } from 'lucide-react';
import { apiPost } from '@/lib/api';

interface FormErrors {
  name?: string;
  trigger_type?: string;
}

export function RulesCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{valid: boolean; message: string; details?: string[]} | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState({
    name: '',
    condition_logic: 'and',
    trigger_type: '',
    enabled: true,
    conditions: [],
    triggers: [],
    webhook: {
      url: '',
      method: 'POST',
      headers: {},
      body_template: '',
    },
  });

  const validateLocal = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Rule name is required';
    }
    
    if (!formData.trigger_type) {
      newErrors.trigger_type = 'Trigger type is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleValidate = async () => {
    if (!validateLocal()) {
      toast({ title: 'Error', description: 'Please fix the errors above', variant: 'destructive' });
      return;
    }

    setValidating(true);
    setValidationResult(null);

    try {
      const data = await apiPost<{ success: boolean; data?: { message: string }; error?: { message: string; details?: unknown[] } }>('/rules/validate', {
        name: formData.name,
        condition_logic: formData.condition_logic,
        trigger_type: formData.trigger_type,
        conditions: formData.conditions,
        triggers: formData.triggers,
      });
      
      if (data.success) {
        setValidationResult({ valid: true, message: data.data?.message || 'Valid' });
        toast({ title: 'Success', description: 'Rule validation passed', variant: 'success' });
      } else {
        const details = (data.error?.details || []) as string[];
        setValidationResult({ valid: false, message: data.error?.message || 'Validation failed', details });
        toast({ title: 'Error', description: data.error?.message || 'Validation failed', variant: 'destructive' });
      }
    } catch (error) {
      setValidationResult({ valid: false, message: 'Validation failed' });
      toast({ title: 'Error', description: 'Validation failed', variant: 'destructive' });
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateLocal()) {
      toast({ title: 'Error', description: 'Please fix the errors above', variant: 'destructive' });
      return;
    }
    
    setLoading(true);

    try {
      const data = await apiPost<{ success: boolean; error?: { message: string } }>('/rules', {
        name: formData.name,
        condition_logic: formData.condition_logic,
        trigger_type: formData.trigger_type,
        enabled: formData.enabled,
        conditions: [],
        triggers: [],
      });
      
      if (data.success) {
        toast({ title: 'Success', description: 'Rule created successfully', variant: 'success' });
        navigate('/rules');
      } else {
        toast({ title: 'Error', description: data.error?.message || 'Failed to create rule', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create rule', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const triggerTypes = [
    { value: 'trade', label: 'Trade' },
    { value: 'notify', label: 'Notify' },
    { value: 'adjust_risk', label: 'Adjust Risk' },
    { value: 'webhook', label: 'Webhook' },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate('/rules')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Rule</h1>
          <p className="text-muted-foreground">
            Create a new trading rule
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Rule Details</CardTitle>
            <CardDescription>
              Configure your trading rule conditions and triggers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="My Trading Rule"
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
              <Label htmlFor="condition_logic">Condition Logic</Label>
              <Select
                id="condition_logic"
                className="w-full"
                value={formData.condition_logic}
                onChange={(value) => setFormData({ ...formData, condition_logic: value })}
                options={[
                  { value: 'and', label: 'AND (all conditions must match)' },
                  { value: 'or', label: 'OR (any condition must match)' },
                ]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trigger_type">Trigger Type *</Label>
              <Select
                id="trigger_type"
                className={`w-full ${errors.trigger_type ? 'border-red-500' : ''}`}
                placeholder="Select trigger type"
                value={formData.trigger_type || undefined}
                onChange={(value) => {
                  setFormData({ ...formData, trigger_type: value });
                  if (errors.trigger_type) setErrors({ ...errors, trigger_type: undefined });
                }}
                options={triggerTypes}
              />
              {errors.trigger_type && (
                <p className="text-sm text-red-500">{errors.trigger_type}</p>
              )}
            </div>

            {/* Webhook Configuration */}
            {formData.trigger_type === 'webhook' && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                <h4 className="font-semibold">Webhook Configuration</h4>
                <p className="text-sm text-muted-foreground">
                  Configure where to send webhook notifications when this rule triggers
                </p>
                
                <div className="space-y-2">
                  <Label htmlFor="webhook_url">Webhook URL *</Label>
                  <Input
                    id="webhook_url"
                    placeholder="https://your-webhook-endpoint.com/webhook"
                    value={formData.webhook.url}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      webhook: { ...formData.webhook, url: e.target.value }
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhook_method">HTTP Method</Label>
                  <Select
                    id="webhook_method"
                    className="w-full"
                    value={formData.webhook.method}
                    onChange={(value) => setFormData({ 
                      ...formData, 
                      webhook: { ...formData.webhook, method: value }
                    })}
                    options={[
                      { value: 'POST', label: 'POST' },
                      { value: 'GET', label: 'GET' },
                      { value: 'PUT', label: 'PUT' },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhook_body">Body Template (optional)</Label>
                  <Input
                    id="webhook_body"
                    placeholder='{"symbol": "{{symbol}}", "price": {{price}}, "pnl": {{pnl}}}'
                    value={formData.webhook.body_template}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      webhook: { ...formData.webhook, body_template: e.target.value }
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {"{{variable}}"} syntax for dynamic values. Available: symbol, price, pnl, rule_name
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
              <Label htmlFor="enabled">Enabled</Label>
            </div>

            {/* Validation Result */}
            {validationResult && (
              <div className={`p-3 rounded-lg ${validationResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {validationResult.valid ? (
                    <CheckCircle className="text-green-600 h-5 w-5" />
                  ) : (
                    <XCircle className="text-red-600 h-5 w-5" />
                  )}
                  <span className={validationResult.valid ? 'text-green-700' : 'text-red-700'}>
                    {validationResult.message}
                  </span>
                </div>
                {validationResult.details && validationResult.details.length > 0 && (
                  <ul className="mt-2 text-sm text-red-600 list-disc list-inside">
                    {validationResult.details.map((detail, i) => (
                      <li key={i}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={loading}>
                <Plus className="mr-2 h-4 w-4" />
                {loading ? 'Creating...' : 'Create Rule'}
              </Button>
              <Button type="button" onClick={handleValidate} disabled={validating}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {validating ? 'Validating...' : 'Validate'}
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

export default RulesCreate;

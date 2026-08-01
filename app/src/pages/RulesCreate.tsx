import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button, Select } from 'antd';
import { message } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface FormErrors {
  name?: string;
  trigger_type?: string;
}

export function RulesCreate() {
  const navigate = useNavigate();
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
      message.error('Please fix the errors above');
      return;
    }

    setValidating(true);
    setValidationResult(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/rules/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          condition_logic: formData.condition_logic,
          trigger_type: formData.trigger_type,
          conditions: formData.conditions,
          triggers: formData.triggers,
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setValidationResult({ valid: true, message: data.data.message });
        message.success('Rule validation passed');
      } else {
        const details = data.error?.details || [];
        setValidationResult({ valid: false, message: data.error?.message || 'Validation failed', details });
        message.error(data.error?.message || 'Validation failed');
      }
    } catch (error) {
      setValidationResult({ valid: false, message: 'Validation failed' });
      message.error('Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateLocal()) {
      message.error('Please fix the errors above');
      return;
    }
    
    setLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          condition_logic: formData.condition_logic,
          trigger_type: formData.trigger_type,
          enabled: formData.enabled,
          conditions: [],
          triggers: [],
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        message.success('Rule created successfully');
        navigate('/rules');
      } else {
        message.error(data.error?.message || 'Failed to create rule');
      }
    } catch (error) {
      message.error('Failed to create rule');
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
          type="text" 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate('/rules')}
        >
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
                    <CheckCircleOutlined className="text-green-600" />
                  ) : (
                    <CloseCircleOutlined className="text-red-600" />
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
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={loading}>
                Create Rule
              </Button>
              <Button type="default" onClick={handleValidate} loading={validating}>
                <CheckCircleOutlined className="mr-2" />
                Validate
              </Button>
              <Button variant="outlined" onClick={() => navigate('/rules')}>
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

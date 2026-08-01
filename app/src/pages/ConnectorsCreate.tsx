import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from 'antd';
import { message } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface FormErrors {
  label?: string;
  apiKey?: string;
  apiSecret?: string;
}

export function ConnectorsCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState({
    exchange: 'kraken',
    label: '',
    paperMode: true,
    apiKey: '',
    apiSecret: '',
  });

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!formData.label.trim()) {
      newErrors.label = 'Label is required';
    }
    
    if (!formData.apiKey.trim()) {
      newErrors.apiKey = 'API Key is required';
    }
    
    if (!formData.apiSecret.trim()) {
      newErrors.apiSecret = 'API Secret is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTestConnection = async () => {
    if (!formData.apiKey.trim() || !formData.apiSecret.trim()) {
      message.error('Please enter API key and secret first');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/connectors/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exchange: formData.exchange,
          apiKey: formData.apiKey,
          apiSecret: formData.apiSecret,
          paperMode: formData.paperMode,
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setTestResult({ success: true, message: 'Connection successful!' });
        message.success('Connection test passed');
      } else {
        setTestResult({ success: false, message: data.error?.message || 'Connection failed' });
        message.error(data.error?.message || 'Connection test failed');
      }
    } catch (error) {
      setTestResult({ success: false, message: 'Connection test failed' });
      message.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) {
      message.error('Please fix the errors above');
      return;
    }
    
    setLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/connectors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        message.success('Connector created successfully');
        navigate('/connectors');
      } else {
        message.error(data.error?.message || 'Failed to create connector');
      }
    } catch (error) {
      message.error('Failed to create connector');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button 
          type="text" 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate('/connectors')}
        >
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Add Connector</h1>
          <p className="text-muted-foreground">
            Connect to a new exchange or wallet
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Connector Details</CardTitle>
            <CardDescription>
              Enter your exchange credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exchange">Exchange</Label>
              <select
                id="exchange"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.exchange}
                onChange={(e) => setFormData({ ...formData, exchange: e.target.value })}
              >
                <option value="kraken">Kraken</option>
                <option value="solana">Solana</option>
                <option value="jupiter">Jupiter</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="label">Label *</Label>
              <Input
                id="label"
                placeholder="My Kraken Account"
                value={formData.label}
                onChange={(e) => {
                  setFormData({ ...formData, label: e.target.value });
                  if (errors.label) setErrors({ ...errors, label: undefined });
                }}
                className={errors.label ? 'border-red-500' : undefined}
              />
              {errors.label && (
                <p className="text-sm text-red-500">{errors.label}</p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="paperMode"
                checked={formData.paperMode}
                onCheckedChange={(checked) => setFormData({ ...formData, paperMode: checked })}
              />
              <Label htmlFor="paperMode">Paper Trading Mode</Label>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <Label>API Credentials</Label>
              <p className="text-sm text-muted-foreground">
                These will be encrypted before storage
              </p>
              
              <div className="space-y-2 mt-2">
                <Label htmlFor="apiKey">API Key *</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Enter your API key"
                  value={formData.apiKey}
                  onChange={(e) => {
                    setFormData({ ...formData, apiKey: e.target.value });
                    if (errors.apiKey) setErrors({ ...errors, apiKey: undefined });
                  }}
                  className={errors.apiKey ? 'border-red-500' : undefined}
                />
                {errors.apiKey && (
                  <p className="text-sm text-red-500">{errors.apiKey}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="apiSecret">API Secret *</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  placeholder="Enter your API secret"
                  value={formData.apiSecret}
                  onChange={(e) => {
                    setFormData({ ...formData, apiSecret: e.target.value });
                    if (errors.apiSecret) setErrors({ ...errors, apiSecret: undefined });
                    setTestResult(null);
                  }}
                  className={errors.apiSecret ? 'border-red-500' : undefined}
                />
                {errors.apiSecret && (
                  <p className="text-sm text-red-500">{errors.apiSecret}</p>
                )}
              </div>

              {/* Test Connection */}
              <div className="flex items-center gap-4 pt-2">
                <Button 
                  type="default" 
                  onClick={handleTestConnection}
                  loading={testing}
                  disabled={!formData.apiKey || !formData.apiSecret}
                >
                  Test Connection
                </Button>
                {testResult && (
                  <span className={`flex items-center gap-1 ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResult.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="primary" htmlType="submit" loading={loading}>
                Create Connector
              </Button>
              <Button variant="outlined" onClick={() => navigate('/connectors')}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default ConnectorsCreate;

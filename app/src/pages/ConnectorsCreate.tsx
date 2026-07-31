import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function ConnectorsCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    exchange: 'kraken',
    label: '',
    paperMode: true,
    apiKey: '',
    apiSecret: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      if (response.ok) {
        navigate('/connectors');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Add Connector</h1>
        <p className="text-muted-foreground">
          Connect to a new exchange or wallet
        </p>
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
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                placeholder="My Kraken Account"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              />
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
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  value={formData.apiSecret}
                  onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Connector'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/connectors')}>
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

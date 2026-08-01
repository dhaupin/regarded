import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { apiGet, apiPut } from '@/lib/api';

export function ConnectorsEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    label: 'My Kraken Account',
    paperMode: true,
    apiKey: '',
    apiSecret: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiPut(`/connectors/${id}`, formData);
      navigate('/connectors');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Edit Connector</h1>
        <p className="text-muted-foreground">
          Update your connector settings
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Connector Details</CardTitle>
            <CardDescription>
              Update your exchange credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
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
              <Label>Update API Credentials (leave blank to keep current)</Label>
              
              <div className="space-y-2 mt-2">
                <Label htmlFor="apiKey">New API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="apiSecret">New API Secret</Label>
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
                {loading ? 'Saving...' : 'Save Changes'}
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

export default ConnectorsEdit;

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuthProvider } from '@/hooks/useAuth';
import { message } from 'antd';
import { Spin, Button } from 'antd';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface UserConfig {
  theme: string;
  timezone: string;
  notifications: {
    trade_executed: boolean;
    rule_triggered: boolean;
    position_closed: boolean;
    error_alerts: boolean;
  };
}

export function Settings() {
  const { user } = useAuthProvider();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<UserConfig>({
    theme: 'dark',
    timezone: 'UTC',
    notifications: {
      trade_executed: true,
      rule_triggered: true,
      position_closed: true,
      error_alerts: true,
    },
  });

  useEffect(() => {
    fetch(`${API_URL}/config`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setConfig(data.data);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/config`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });
      
      const data = await res.json();
      if (data.success) {
        message.success('Settings saved');
      } else {
        message.error('Failed to save settings');
      }
    } catch {
      message.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleNotificationChange = (key: keyof UserConfig['notifications'], value: boolean) => {
    setConfig(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account and preferences
          </p>
        </div>
        <div className="flex justify-center py-10">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and preferences
        </p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Your account information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={user?.name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email || ''} disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Customize your trading experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              <Input 
                id="theme" 
                value={config.theme} 
                onChange={(e) => setConfig(prev => ({ ...prev, theme: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input 
                id="timezone" 
                value={config.timezone} 
                onChange={(e) => setConfig(prev => ({ ...prev, timezone: e.target.value }))}
              />
            </div>
            <Button onClick={handleSaveConfig} loading={saving}>
              Save Preferences
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Configure how you receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Trade Executed</Label>
                <p className="text-sm text-muted-foreground">
                  Notify when a trade is executed
                </p>
              </div>
              <Switch 
                checked={config.notifications.trade_executed}
                onCheckedChange={(checked) => handleNotificationChange('trade_executed', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Rule Triggered</Label>
                <p className="text-sm text-muted-foreground">
                  Notify when a rule is triggered
                </p>
              </div>
              <Switch 
                checked={config.notifications.rule_triggered}
                onCheckedChange={(checked) => handleNotificationChange('rule_triggered', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Position Closed</Label>
                <p className="text-sm text-muted-foreground">
                  Notify when a position is closed
                </p>
              </div>
              <Switch 
                checked={config.notifications.position_closed}
                onCheckedChange={(checked) => handleNotificationChange('position_closed', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Error Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Notify on errors and issues
                </p>
              </div>
              <Switch 
                checked={config.notifications.error_alerts}
                onCheckedChange={(checked) => handleNotificationChange('error_alerts', checked)}
              />
            </div>
            <Button onClick={handleSaveConfig} loading={saving}>
              Save Notifications
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>
              Manage your security settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outlined">Change Password</Button>
            <Button variant="outlined">Enable Two-Factor Auth</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Settings;

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuthProvider } from '@/hooks/useAuth';
import { message } from 'antd';
import { Spin, Button, Select, Tabs, Tag, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, ApiOutlined, KeyOutlined, ClockCircleOutlined, GlobalOutlined } from '@ant-design/icons';

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
  rateLimits: {
    trades_per_minute: number;
    requests_per_minute: number;
  };
  webhooks: {
    enabled: boolean;
    endpoints: Array<{
      id: string;
      url: string;
      events: string[];
      active: boolean;
    }>;
  };
}

interface Session {
  id: string;
  created_at: string;
  last_active: string;
  ip: string;
  user_agent: string;
}

export function Settings() {
  const { user } = useAuthProvider();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [config, setConfig] = useState<UserConfig>({
    theme: 'dark',
    timezone: 'UTC',
    notifications: {
      trade_executed: true,
      rule_triggered: true,
      position_closed: true,
      error_alerts: true,
    },
    rateLimits: {
      trades_per_minute: 10,
      requests_per_minute: 60,
    },
    webhooks: {
      enabled: false,
      endpoints: [],
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

  const handleAddWebhook = () => {
    if (!newWebhookUrl) {
      message.error('Please enter a webhook URL');
      return;
    }
    setConfig(prev => ({
      ...prev,
      webhooks: {
        ...prev.webhooks,
        endpoints: [
          ...prev.webhooks.endpoints,
          {
            id: crypto.randomUUID(),
            url: newWebhookUrl,
            events: ['trade_executed', 'rule_triggered'],
            active: true,
          },
        ],
      },
    }));
    setNewWebhookUrl('');
    message.success('Webhook endpoint added');
  };

  const handleRemoveWebhook = (id: string) => {
    setConfig(prev => ({
      ...prev,
      webhooks: {
        ...prev.webhooks,
        endpoints: prev.webhooks.endpoints.filter(e => e.id !== id),
      },
    }));
    message.success('Webhook endpoint removed');
  };

  // Demo sessions
  const demoSessions: Session[] = [
    {
      id: '1',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      last_active: new Date().toISOString(),
      ip: '192.168.1.100',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    },
    {
      id: '2',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      last_active: new Date(Date.now() - 1800000).toISOString(),
      ip: '192.168.1.101',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    },
  ];

  const tabItems = [
    {
      key: 'general',
      label: 'General',
      children: (
        <div className="space-y-6">
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
                <Select
                  id="theme"
                  className="w-full"
                  value={config.theme}
                  onChange={(value) => setConfig(prev => ({ ...prev, theme: value }))}
                  options={[
                    { value: 'dark', label: 'Dark' },
                    { value: 'light', label: 'Light' },
                    { value: 'system', label: 'System' },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  id="timezone"
                  className="w-full"
                  value={config.timezone}
                  onChange={(value) => setConfig(prev => ({ ...prev, timezone: value }))}
                  options={[
                    { value: 'UTC', label: 'UTC' },
                    { value: 'America/New_York', label: 'Eastern Time' },
                    { value: 'America/Los_Angeles', label: 'Pacific Time' },
                    { value: 'Europe/London', label: 'London' },
                    { value: 'Asia/Tokyo', label: 'Tokyo' },
                  ]}
                />
              </div>
              <Button onClick={handleSaveConfig} loading={saving}>
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      key: 'notifications',
      label: 'Notifications',
      children: (
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
      ),
    },
    {
      key: 'api',
      label: 'API & Limits',
      children: (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rate Limits</CardTitle>
              <CardDescription>
                Configure API rate limits for your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert
                message="Rate Limit Info"
                description="These limits help protect your account and ensure fair usage. Adjust with caution."
                type="info"
                showIcon
              />
              <div className="space-y-2">
                <Label htmlFor="trades_per_minute">Trades per Minute</Label>
                <Input 
                  id="trades_per_minute" 
                  type="number"
                  value={config.rateLimits.trades_per_minute} 
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    rateLimits: { ...prev.rateLimits, trades_per_minute: parseInt(e.target.value) || 0 }
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="requests_per_minute">API Requests per Minute</Label>
                <Input 
                  id="requests_per_minute" 
                  type="number"
                  value={config.rateLimits.requests_per_minute} 
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    rateLimits: { ...prev.rateLimits, requests_per_minute: parseInt(e.target.value) || 0 }
                  }))}
                />
              </div>
              <Button onClick={handleSaveConfig} loading={saving}>
                Save Rate Limits
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Manage your API keys for programmatic access
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <KeyOutlined />
                  <div>
                    <p className="font-medium">Default API Key</p>
                    <p className="text-sm text-muted-foreground">Created automatically</p>
                  </div>
                </div>
                <Tag color="green">Active</Tag>
              </div>
              <Button icon={<PlusOutlined />}>
                Generate New API Key
              </Button>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      key: 'webhooks',
      label: 'Webhooks',
      children: (
        <Card>
          <CardHeader>
            <CardTitle>Webhook Endpoints</CardTitle>
            <CardDescription>
              Configure webhook URLs to receive real-time notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch 
                checked={config.webhooks.enabled}
                onCheckedChange={(checked) => setConfig(prev => ({ 
                  ...prev, 
                  webhooks: { ...prev.webhooks, enabled: checked }
                }))}
              />
              <Label>Enable Webhooks</Label>
            </div>

            {config.webhooks.enabled && (
              <>
                <div className="flex gap-2">
                  <Input 
                    placeholder="https://your-webhook-endpoint.com/webhook"
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button icon={<PlusOutlined />} onClick={handleAddWebhook}>
                    Add
                  </Button>
                </div>

                {config.webhooks.endpoints.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No webhook endpoints configured
                  </p>
                ) : (
                  <div className="space-y-2">
                    {config.webhooks.endpoints.map((endpoint) => (
                      <div key={endpoint.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <GlobalOutlined />
                          <div>
                            <p className="font-medium truncate max-w-md">{endpoint.url}</p>
                            <p className="text-sm text-muted-foreground">
                              Events: {endpoint.events.join(', ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Tag color={endpoint.active ? 'green' : 'default'}>
                            {endpoint.active ? 'Active' : 'Inactive'}
                          </Tag>
                          <Button 
                            type="text" 
                            danger 
                            icon={<DeleteOutlined />}
                            onClick={() => handleRemoveWebhook(endpoint.id)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <Button onClick={handleSaveConfig} loading={saving}>
              Save Webhooks
            </Button>
          </CardContent>
        </Card>
      ),
    },
    {
      key: 'security',
      label: 'Security',
      children: (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>
                Change your account password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current_password">Current Password</Label>
                <Input id="current_password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_password">New Password</Label>
                <Input id="new_password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirm New Password</Label>
                <Input id="confirm_password" type="password" />
              </div>
              <Button>
                Update Password
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>
                Add an extra layer of security to your account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <ApiOutlined className="text-xl" />
                  <div>
                    <p className="font-medium">Authenticator App</p>
                    <p className="text-sm text-muted-foreground">Use an authenticator app to generate codes</p>
                  </div>
                </div>
                <Button>
                  Enable
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
              <CardDescription>
                Manage your active sessions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {demoSessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <ClockCircleOutlined className="text-xl" />
                    <div>
                      <p className="font-medium">{session.ip}</p>
                      <p className="text-sm text-muted-foreground truncate max-w-xs">
                        {session.user_agent}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last active: {new Date(session.last_active).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Tag color="green">Current</Tag>
                </div>
              ))}
              <Button danger>
                Revoke All Other Sessions
              </Button>
            </CardContent>
          </Card>
        </div>
      ),
    },
  ];

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

      <Tabs 
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />
    </div>
  );
}

export default Settings;

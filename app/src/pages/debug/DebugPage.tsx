import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { 
  Api, 
  History, 
  Bug, 
  Trash2, 
  Download, 
  Copy,
} from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'api' | 'trade' | 'rule' | 'agent' | 'system';
  message: string;
  details?: Record<string, unknown>;
}

interface ApiLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export function DebugPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('logs');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Demo logs for agents
  const demoLogs: LogEntry[] = [
    {
      id: '1',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      level: 'info',
      category: 'agent',
      message: 'Agent started',
      details: { agent_id: 'agent-001', mode: 'paper' }
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 55000).toISOString(),
      level: 'debug',
      category: 'rule',
      message: 'Evaluating rule: RSI Oversold',
      details: { rule_id: 'rule-001', rsi_value: 28.5, threshold: 30 }
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 50000).toISOString(),
      level: 'info',
      category: 'trade',
      message: 'Buy order placed',
      details: { symbol: 'BTC/USD', size: 0.01, price: 42500 }
    },
    {
      id: '4',
      timestamp: new Date(Date.now() - 45000).toISOString(),
      level: 'info',
      category: 'trade',
      message: 'Order filled',
      details: { order_id: 'order-123', filled_price: 42500 }
    },
    {
      id: '5',
      timestamp: new Date(Date.now() - 40000).toISOString(),
      level: 'debug',
      category: 'api',
      message: 'API request: Get candles',
      details: { exchange: 'kraken', symbol: 'BTC/USD', interval: '1h' }
    },
    {
      id: '6',
      timestamp: new Date(Date.now() - 35000).toISOString(),
      level: 'warn',
      category: 'system',
      message: 'Rate limit warning',
      details: { endpoint: '/api/trades', remaining: 5 }
    },
    {
      id: '7',
      timestamp: new Date(Date.now() - 30000).toISOString(),
      level: 'info',
      category: 'rule',
      message: 'Rule triggered: Take Profit',
      details: { rule_id: 'rule-002', pnl_percent: 5.2 }
    },
    {
      id: '8',
      timestamp: new Date(Date.now() - 25000).toISOString(),
      level: 'info',
      category: 'trade',
      message: 'Sell order placed',
      details: { symbol: 'BTC/USD', size: 0.01, price: 44750 }
    },
    {
      id: '9',
      timestamp: new Date(Date.now() - 20000).toISOString(),
      level: 'info',
      category: 'trade',
      message: 'Trade closed',
      details: { trade_id: 'trade-001', pnl: 22.5, pnl_percent: 5.29 }
    },
    {
      id: '10',
      timestamp: new Date(Date.now() - 15000).toISOString(),
      level: 'error',
      category: 'api',
      message: 'API request failed',
      details: { endpoint: '/api/positions', error: 'Connection timeout' }
    },
  ];

  const demoApiLogs: ApiLog[] = [
    {
      id: '1',
      timestamp: new Date(Date.now() - 10000).toISOString(),
      method: 'GET',
      path: '/api/trades',
      status: 200,
      duration: 45,
      response: { success: true, data: { items: [], total: 0 } }
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 8000).toISOString(),
      method: 'GET',
      path: '/api/positions',
      status: 200,
      duration: 32,
      response: { success: true, data: { items: [] } }
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 5000).toISOString(),
      method: 'GET',
      path: '/api/strategies',
      status: 200,
      duration: 28,
      response: { success: true, data: { items: [] } }
    },
    {
      id: '4',
      timestamp: new Date(Date.now() - 2000).toISOString(),
      method: 'POST',
      path: '/api/connectors/test',
      status: 200,
      duration: 150,
      request: { exchange: 'kraken', paperMode: true },
      response: { success: true, data: { message: 'Connection test passed' } }
    },
  ];

  useEffect(() => {
    // Simulate loading
    setTimeout(() => {
      setLogs(demoLogs);
      setApiLogs(demoApiLogs);
      setLoading(false);
    }, 500);
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;
    return matchesLevel && matchesCategory;
  });

  const getLevelVariant = (level: string): 'destructive' | 'outline' | 'secondary' | 'default' => {
    switch (level) {
      case 'error': return 'destructive';
      case 'warn': return 'outline';
      case 'debug': return 'secondary';
      default: return 'default';
    }
  };

  const getCategoryVariant = (level: string): 'destructive' | 'outline' | 'secondary' | 'default' => {
    switch (level) {
      case 'trade': return 'default';
      case 'rule': return 'outline';
      case 'agent': return 'secondary';
      case 'api': return 'secondary';
      default: return 'outline';
    }
  };

  const getMethodVariant = (method: string): 'default' | 'destructive' | 'outline' | 'secondary' => {
    switch (method) {
      case 'GET': return 'default';
      case 'POST': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusVariant = (status: number): 'default' | 'destructive' => {
    return status < 400 ? 'default' : 'destructive';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const exportLogs = () => {
    const data = JSON.stringify(logs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regarded-logs-${new Date().toISOString()}.json`;
    a.click();
  };

  const tabItems = [
    {
      key: 'logs',
      label: (
        <span>
          <History className="mr-2 h-4 w-4" /> Agent Logs
        </span>
      ),
      children: (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <Select
              placeholder="Level"
              value={levelFilter}
              onChange={setLevelFilter}
              style={{ width: 120 }}
              options={[
                { value: 'all', label: 'All Levels' },
                { value: 'info', label: 'Info' },
                { value: 'warn', label: 'Warning' },
                { value: 'error', label: 'Error' },
                { value: 'debug', label: 'Debug' },
              ]}
            />
            <Select
              placeholder="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              style={{ width: 140 }}
              options={[
                { value: 'all', label: 'All Categories' },
                { value: 'agent', label: 'Agent' },
                { value: 'trade', label: 'Trade' },
                { value: 'rule', label: 'Rule' },
                { value: 'api', label: 'API' },
                { value: 'system', label: 'System' },
              ]}
            />
            <Button variant="outline" size="sm" onClick={() => setLogs([])}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={exportLogs}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">
              {filteredLogs.length} entries
            </span>
          </div>

          {/* Logs List */}
          {loading ? (
            <div className="py-10 text-center">
              <Loading />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No logs available</div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredLogs.map((log) => (
                <Card 
                  key={log.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedLog(log)}
                >
                  <CardContent className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <Badge variant={getLevelVariant(log.level)}>{log.level.toUpperCase()}</Badge>
                      <Badge variant={getCategoryVariant(log.category)}>{log.category}</Badge>
                      <span className="flex-1 truncate">{log.message}</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(JSON.stringify(log, null, 2));
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'api',
      label: (
        <span>
          <Api className="mr-2 h-4 w-4" /> API Logs
        </span>
      ),
      children: (
        <div className="space-y-4">
          {apiLogs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No API logs available</div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {apiLogs.map((log) => (
                <Card key={log.id} className="hover:bg-muted/50">
                  <CardContent className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <Badge variant={getMethodVariant(log.method)}>
                        {log.method}
                      </Badge>
                      <span className="flex-1 font-mono text-sm">{log.path}</span>
                      <Badge variant={getStatusVariant(log.status)}>
                        {log.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{log.duration}ms</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'trades',
      label: (
        <span>
          <Bug className="mr-2 h-4 w-4" /> Trade History
        </span>
      ),
      children: (
        <div className="py-10 text-center text-muted-foreground">Trade history will appear here when available</div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Debug & Logs</h1>
          <p className="text-muted-foreground">
            View agent execution logs and API traces
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">Debug Mode</span>
          <Switch 
            checked={showDebug} 
            onChange={setShowDebug} 
          />
        </div>
      </div>

      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab} 
        items={tabItems}
      />

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge variant={getLevelVariant(selectedLog.level)}>
                  {selectedLog.level.toUpperCase()}
                </Badge>
                <Badge variant={getCategoryVariant(selectedLog.category)}>
                  {selectedLog.category}
                </Badge>
                <span className="text-muted-foreground">
                  {new Date(selectedLog.timestamp).toLocaleString()}
                </span>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Message</h4>
              <p>{selectedLog.message}</p>
            </div>
            {selectedLog.details && (
              <div>
                <h4 className="font-semibold mb-2">Details</h4>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            )}
          </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => selectedLog && copyToClipboard(JSON.stringify(selectedLog, null, 2))}>
              <Copy className="mr-2 h-4 w-4" />
              Copy JSON
            </Button>
            <Button onClick={() => setSelectedLog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DebugPage;

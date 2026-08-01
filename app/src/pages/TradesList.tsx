import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spin } from 'antd';
import { SwapOutlined } from '@ant-design/icons';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  size: number;
  price: number;
  total: number;
  fee: number;
  pnl?: number;
  pnl_percent?: number;
  opened_at: string;
  closed_at?: string;
  status: 'open' | 'closed';
}

export function TradesList() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrades = () => {
    setLoading(true);
    fetch(`${API_URL}/trades?page=1&page_size=20`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setTrades(data.data?.items || []);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Trades</h1>
          <p className="text-muted-foreground">
            View your trading history
          </p>
        </div>
      </div>

      {loading && trades.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Spin />
          </CardContent>
        </Card>
      ) : trades.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <SwapOutlined className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No trades yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Your trade history will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Trade History ({trades.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">Time</th>
                    <th className="text-left p-3 font-medium">Symbol</th>
                    <th className="text-left p-3 font-medium">Side</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-right p-3 font-medium">Size</th>
                    <th className="text-right p-3 font-medium">Price</th>
                    <th className="text-right p-3 font-medium">Total</th>
                    <th className="text-right p-3 font-medium">Fee</th>
                    <th className="text-right p-3 font-medium">P&L</th>
                    <th className="text-left p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr key={trade.id} className="border-b hover:bg-muted/50">
                      <td className="p-3 text-sm">{new Date(trade.opened_at).toLocaleString()}</td>
                      <td className="p-3 font-medium">{trade.symbol}</td>
                      <td className="p-3">
                        <Badge variant={trade.side === 'buy' ? 'success' : 'destructive'}>
                          {trade.side.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm">{trade.type}</td>
                      <td className="p-3 text-right">{trade.size.toFixed(4)}</td>
                      <td className="p-3 text-right">${trade.price.toFixed(2)}</td>
                      <td className="p-3 text-right">${trade.total.toFixed(2)}</td>
                      <td className="p-3 text-right">${trade.fee.toFixed(4)}</td>
                      <td className={`p-3 text-right ${(trade.pnl ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.pnl !== undefined ? `$${trade.pnl.toFixed(2)}` : '-'}
                      </td>
                      <td className="p-3">
                        <Badge variant={trade.status === 'closed' ? 'secondary' : 'outline'}>
                          {trade.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TradesList;

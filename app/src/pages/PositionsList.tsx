import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table as AntTable, Spin } from 'antd';
import { WalletOutlined } from '@ant-design/icons';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entry_price: number;
  current_price: number;
  pnl: number;
  pnl_percent: number;
  leverage: number;
  liquidation_price?: number;
  opened_at: string;
}

export function PositionsList() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/positions`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setPositions(data.data?.items || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const columns = [
    {
      title: 'Symbol',
      dataIndex: 'symbol',
      key: 'symbol',
    },
    {
      title: 'Side',
      dataIndex: 'side',
      key: 'side',
      render: (side: string) => (
        <Badge variant={side === 'long' ? 'success' : 'destructive'}>
          {side.toUpperCase()}
        </Badge>
      ),
    },
    {
      title: 'Size',
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => size.toFixed(4),
    },
    {
      title: 'Entry Price',
      dataIndex: 'entry_price',
      key: 'entry_price',
      render: (price: number) => `$${price.toFixed(2)}`,
    },
    {
      title: 'Current Price',
      dataIndex: 'current_price',
      key: 'current_price',
      render: (price: number) => `$${price.toFixed(2)}`,
    },
    {
      title: 'P&L',
      dataIndex: 'pnl',
      key: 'pnl',
      render: (pnl: number, record: Position) => (
        <span className={pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
          ${pnl.toFixed(2)} ({record.pnl_percent.toFixed(2)}%)
        </span>
      ),
    },
    {
      title: 'Leverage',
      dataIndex: 'leverage',
      key: 'leverage',
      render: (leverage: number) => `${leverage}x`,
    },
    {
      title: 'Opened',
      dataIndex: 'opened_at',
      key: 'opened_at',
      render: (date: string) => new Date(date).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Positions</h1>
          <p className="text-muted-foreground">
            View your open trading positions
          </p>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Spin />
          </CardContent>
        </Card>
      ) : positions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <WalletOutlined className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No open positions</p>
            <p className="text-sm text-muted-foreground mt-2">
              Start your trading agent to open positions
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Open Positions ({positions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <AntTable
              dataSource={positions}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="middle"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PositionsList;

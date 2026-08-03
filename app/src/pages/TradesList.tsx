import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeftRight } from 'lucide-react';
import { apiGet } from '@/lib/api';

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
  const [search, setSearch] = useState('');
  const [sideFilter, setSideFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchTrades = async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: Trade[]; total: number }>('/trades', {
        page: pageNum,
        page_size: pageSize,
      });
      setTrades(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch trades:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades(page);
  }, [page]);

  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        trade.symbol.toLowerCase().includes(searchLower);
      
      const matchesSide = sideFilter === 'all' || trade.side === sideFilter;
      const matchesStatus = statusFilter === 'all' || trade.status === statusFilter;
      
      return matchesSearch && matchesSide && matchesStatus;
    });
  }, [trades, search, sideFilter, statusFilter]);

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

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <Input
          placeholder="Search by symbol..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          
        />
        <Select value={sideFilter} onValueChange={setSideFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Side" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sides</SelectItem>
            <SelectItem value="buy">Buy</SelectItem>
            <SelectItem value="sell">Sell</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredTrades.length} of {total} trades
        </span>
      </div>

      {loading && trades.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Loading text="Loading trades..." />
          </CardContent>
        </Card>
      ) : filteredTrades.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ArrowLeftRight className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {search || sideFilter !== 'all' || statusFilter !== 'all' 
                ? 'No trades match your filters' 
                : 'No trades yet'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Your trade history will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
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
                    {filteredTrades.map((trade) => (
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
          
          <div className="flex justify-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="flex items-center text-sm text-muted-foreground">
              Page {page} of {Math.ceil(total / pageSize)}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => p + 1)}
              disabled={page * pageSize >= total}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default TradesList;

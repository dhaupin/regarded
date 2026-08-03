import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wallet } from 'lucide-react';
import { apiGet } from '@/lib/api';

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
  const [search, setSearch] = useState('');
  const [sideFilter, setSideFilter] = useState<string>('all');

  useEffect(() => {
    apiGet<{ items: Position[] }>('/positions')
      .then((data) => {
        setPositions(data.items || []);
      })
      .catch(() => {
        // Use empty array on error
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const filteredPositions = useMemo(() => {
    return positions.filter(position => {
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        position.symbol.toLowerCase().includes(searchLower);
      
      const matchesSide = sideFilter === 'all' || position.side === sideFilter;
      
      return matchesSearch && matchesSide;
    });
  }, [positions, search, sideFilter]);

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
            <SelectItem value="long">Long</SelectItem>
            <SelectItem value="short">Short</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredPositions.length} of {positions.length} positions
        </span>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Loading text="Loading positions..." />
          </CardContent>
        </Card>
      ) : filteredPositions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {search || sideFilter !== 'all' 
                ? 'No positions match your filters' 
                : 'No open positions'}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Start your trading agent to open positions
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Open Positions ({filteredPositions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead className="text-right">Entry Price</TableHead>
                  <TableHead className="text-right">Current Price</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right">Leverage</TableHead>
                  <TableHead>Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPositions.map((position) => (
                  <TableRow key={position.id}>
                    <TableCell className="font-medium">{position.symbol}</TableCell>
                    <TableCell>
                      <Badge variant={position.side === 'long' ? 'success' : 'destructive'}>
                        {position.side.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{position.size.toFixed(4)}</TableCell>
                    <TableCell className="text-right">${position.entry_price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${position.current_price.toFixed(2)}</TableCell>
                    <TableCell className={`text-right ${position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${position.pnl.toFixed(2)} ({position.pnl_percent.toFixed(2)}%)
                    </TableCell>
                    <TableCell className="text-right">{position.leverage}x</TableCell>
                    <TableCell>{new Date(position.opened_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PositionsList;

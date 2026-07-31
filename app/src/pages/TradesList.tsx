import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SwapOutlined } from '@ant-design/icons';

export function TradesList() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Trades</h1>
        <p className="text-muted-foreground">
          View your trading history
        </p>
      </div>

      <Card>
        <CardContent className="py-10 text-center">
          <SwapOutlined className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No trades yet</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default TradesList;

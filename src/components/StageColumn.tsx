import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StageColumnProps {
  name: string;
  color: string;
  dealCount: number;
  children: React.ReactNode;
}

const StageColumn = ({ name, color, dealCount, children }: StageColumnProps) => {
  return (
    <Card className="flex-shrink-0 w-80">
      <CardHeader 
        className="p-4 border-b"
        style={{ borderTopColor: color, borderTopWidth: '3px' }}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">{name}</CardTitle>
          <Badge variant="secondary">{dealCount}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-3 min-h-[500px] max-h-[calc(100vh-16rem)] overflow-y-auto">
        {children}
      </CardContent>
    </Card>
  );
};

export default StageColumn;

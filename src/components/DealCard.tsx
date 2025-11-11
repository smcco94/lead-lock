import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DealCardProps {
  id: string;
  title: string;
  value?: number;
  ownerName?: string;
  onClick?: () => void;
  isDragging?: boolean;
}

const DealCard = ({ title, value, ownerName, onClick, isDragging }: DealCardProps) => {
  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-md transition-all duration-200",
        isDragging && "opacity-50 rotate-2"
      )}
      onClick={onClick}
    >
      <CardHeader className="p-4 pb-2">
        <h3 className="font-semibold text-sm line-clamp-2">{title}</h3>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-2">
        {value !== undefined && (
          <div className="flex items-center gap-1 text-success">
            <DollarSign className="h-4 w-4" />
            <span className="font-semibold">
              {new Intl.NumberFormat('pt-BR', { 
                style: 'currency', 
                currency: 'BRL' 
              }).format(value)}
            </span>
          </div>
        )}
        {ownerName && (
          <Badge variant="secondary" className="text-xs">
            {ownerName}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
};

export default DealCard;

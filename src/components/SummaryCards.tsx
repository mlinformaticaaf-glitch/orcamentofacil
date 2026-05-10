import { TrendingUp, TrendingDown, Wallet, ArrowRightLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface SummaryCardsProps {
  totalSpent: number;
  totalBudget: number;
  totalIncome: number;
  carriedBalance?: number;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function SummaryCards({ totalSpent, totalBudget, totalIncome, carriedBalance = 0 }: SummaryCardsProps) {
  const balance = totalIncome - totalSpent + carriedBalance;
  const isOverBudget = balance < 0;
  const hasCarried = carriedBalance !== 0;

  const cards = [
    {
      title: 'Total Receitas',
      value: totalIncome,
      icon: TrendingUp,
      iconClass: 'text-success',
      bgClass: 'bg-success/10',
    },
    {
      title: 'Total Gasto',
      value: totalSpent,
      icon: TrendingDown,
      iconClass: 'text-destructive',
      bgClass: 'bg-destructive/10',
    },
    {
      title: 'Total Orçado',
      value: totalBudget,
      icon: Wallet,
      iconClass: 'text-accent',
      bgClass: 'bg-accent/10',
    },
    {
      title: 'Saldo Disponível',
      value: balance,
      icon: isOverBudget ? TrendingDown : TrendingUp,
      iconClass: isOverBudget ? 'text-destructive' : 'text-success',
      bgClass: isOverBudget ? 'bg-destructive/10' : 'bg-success/10',
      subtitle: hasCarried
        ? `Saldo anterior: ${formatCurrency(carriedBalance)}`
        : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="glass-card p-3 sm:p-5 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-muted-foreground font-medium truncate">{card.title}</p>
              <p className="text-lg sm:text-2xl font-display font-bold mt-0.5 sm:mt-1 truncate">{formatCurrency(card.value)}</p>
              {'subtitle' in card && card.subtitle && (
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate">{card.subtitle}</p>
              )}
            </div>
            <div className={`p-2 sm:p-3 rounded-xl shrink-0 ${card.bgClass}`}>
              <card.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${card.iconClass}`} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

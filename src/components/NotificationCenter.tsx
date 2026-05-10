import { useState, useMemo } from 'react';
import { Bell } from 'lucide-react';
import { Expense, Income, CreditCard } from '@/types/budget';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isToday, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface NotificationCenterProps {
  expenses: Expense[];
  incomes: Income[];
  creditCards: CreditCard[];
  onNavigateToCards: () => void;
  onNavigateToExpenses: () => void;
}

interface Notification {
  id: string;
  type: 'expense_due' | 'card_due';
  title: string;
  description: string;
  action: () => void;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function NotificationCenter({ expenses, incomes, creditCards, onNavigateToCards, onNavigateToExpenses }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);

  const notifications = useMemo<Notification[]>(() => {
    const today = startOfDay(new Date());
    const notifs: Notification[] = [];

    // 1. Expenses due today or overdue (non-card, pending)
    expenses
      .filter(e => !e.creditCardId && e.status === 'pending')
      .forEach(e => {
        const expDate = startOfDay(parseISO(e.date));
        if (isToday(expDate) || isBefore(expDate, today)) {
          notifs.push({
            id: `exp-${e.id}`,
            type: 'expense_due',
            title: isToday(expDate) ? 'Despesa vence hoje' : 'Despesa vencida',
            description: `${e.description} — ${formatCurrency(e.amount)} (${format(expDate, 'dd/MM')})`,
            action: () => { onNavigateToExpenses(); setOpen(false); },
          });
        }
      });

    // 2. Credit card invoices overdue and not fully paid
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    creditCards.forEach(card => {
      // Build due date for this month
      const dueDay = Math.min(card.dueDay, 28); // safe day
      const dueDate = new Date(currentYear, currentMonth, dueDay);

      if (isBefore(dueDate, today) || isToday(startOfDay(dueDate))) {
        // Check if there are pending expenses for this card this month
        const cardMonthExpenses = expenses.filter(e => {
          if (e.creditCardId !== card.id) return false;
          const d = parseISO(e.date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
        const pendingAmount = cardMonthExpenses
          .filter(e => e.status !== 'paid')
          .reduce((sum, e) => sum + e.amount, 0);

        if (pendingAmount > 0) {
          notifs.push({
            id: `card-${card.id}`,
            type: 'card_due',
            title: 'Fatura vencida',
            description: `${card.name} •••• ${card.lastDigits} — ${formatCurrency(pendingAmount)} pendente`,
            action: () => { onNavigateToCards(); setOpen(false); },
          });
        }
      }
    });

    return notifs;
  }, [expenses, creditCards, onNavigateToCards, onNavigateToExpenses]);

  const count = notifications.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center bg-destructive text-destructive-foreground border-0">
              {count > 9 ? '9+' : count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-border">
          <h3 className="font-semibold text-sm">Notificações</h3>
        </div>
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma pendência 🎉
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={n.action}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
              >
                <p className={cn(
                  "text-xs font-semibold",
                  n.type === 'card_due' ? 'text-destructive' : 'text-warning'
                )}>
                  {n.title}
                </p>
                <p className="text-sm text-foreground mt-0.5">{n.description}</p>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

import { addDays, endOfMonth, subMonths } from 'date-fns';
import { CreditCard, Expense } from '@/types/budget';

export interface CreditCardMonthlyBalance {
  openingBalance: number;
  monthlyActivity: number;
  closingBalance: number;
  expenses: Expense[];
  period: {
    start: Date;
    end: Date;
  };
}

function clampDay(year: number, month: number, day: number) {
  const monthEnd = endOfMonth(new Date(year, month, 1));
  return Math.min(day, monthEnd.getDate());
}

function getClosingDate(month: Date, closingDay: number) {
  const day = clampDay(month.getFullYear(), month.getMonth(), closingDay);
  return new Date(month.getFullYear(), month.getMonth(), day, 23, 59, 59, 999);
}

export function getCreditCardInvoicePeriod(
  card: Pick<CreditCard, 'closingDay'>,
  month: Date,
) {
  const previousMonth = subMonths(month, 1);
  const previousClosing = getClosingDate(previousMonth, card.closingDay);
  const currentClosing = getClosingDate(month, card.closingDay);

  return {
    start: addDays(previousClosing, 1),
    end: currentClosing,
  };
}

export function calculateCreditCardMonthlyBalance(
  card: Pick<CreditCard, 'id' | 'closingDay'>,
  expenses: Expense[],
  month: Date,
): CreditCardMonthlyBalance {
  const period = getCreditCardInvoicePeriod(card, month);
  const cardExpenses = expenses
    .filter(expense => expense.creditCardId === card.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  let openingBalance = 0;
  let monthlyActivity = 0;
  const periodExpenses: Expense[] = [];

  for (const expense of cardExpenses) {
    const expenseDate = new Date(expense.date);

    if (expenseDate < period.start) {
      openingBalance += expense.amount;
      continue;
    }

    if (expenseDate <= period.end) {
      monthlyActivity += expense.amount;
      periodExpenses.push(expense);
    }
  }

  return {
    openingBalance,
    monthlyActivity,
    closingBalance: openingBalance + monthlyActivity,
    expenses: periodExpenses,
    period,
  };
}

import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { Expense, Income } from '@/types/budget';

type MonthEntry = {
  date: string;
  amount: number;
  status: string;
};

function getMonthKey(date: Date) {
  return format(date, 'yyyy-MM');
}

function monthKeyToDate(key: string) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function isMonthOverdue(month: Date, today: Date) {
  return endOfMonth(month).getTime() < today.getTime();
}

function sumByMonth<T extends MonthEntry>(
  entries: T[],
  validStatus: T['status'],
) {
  const totals = new Map<string, number>();

  for (const entry of entries) {
    if (entry.status !== validStatus) continue;

    const key = entry.date.substring(0, 7);
    totals.set(key, (totals.get(key) || 0) + entry.amount);
  }

  return totals;
}

function getMonthNet(
  month: Date,
  incomeByMonth: Map<string, number>,
  expenseByMonth: Map<string, number>,
) {
  const key = getMonthKey(month);
  return (incomeByMonth.get(key) || 0) - (expenseByMonth.get(key) || 0);
}

function sumOverdueBalanceBefore(
  month: Date,
  firstMonth: Date,
  incomeByMonth: Map<string, number>,
  expenseByMonth: Map<string, number>,
  today: Date,
) {
  let carried = 0;

  for (let current = firstMonth; current < month; current = startOfMonth(new Date(current.getFullYear(), current.getMonth() + 1, 1))) {
    if (!isMonthOverdue(current, today)) break;
    carried += getMonthNet(current, incomeByMonth, expenseByMonth);
  }

  return carried;
}

export function calculateCarriedBalance(
  incomes: Income[],
  expenses: Expense[],
  month: Date,
  today = new Date(),
) {
  const target = startOfMonth(month);
  const previousMonth = subMonths(target, 1);

  const incomeByMonth = sumByMonth(incomes, 'received');
  const expenseByMonth = sumByMonth(expenses, 'paid');
  const monthKeys = [...incomeByMonth.keys(), ...expenseByMonth.keys()];

  if (monthKeys.length === 0) {
    return 0;
  }

  const firstMonth = monthKeyToDate(monthKeys.sort()[0]);

  if (isMonthOverdue(previousMonth, today)) {
    return sumOverdueBalanceBefore(target, firstMonth, incomeByMonth, expenseByMonth, today);
  }

  const carriedIntoPreviousMonth = sumOverdueBalanceBefore(
    previousMonth,
    firstMonth,
    incomeByMonth,
    expenseByMonth,
    today,
  );
  const previousMonthBalance = carriedIntoPreviousMonth + getMonthNet(previousMonth, incomeByMonth, expenseByMonth);

  return previousMonthBalance > 0 ? previousMonthBalance : 0;
}

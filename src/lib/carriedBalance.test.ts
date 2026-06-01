import { describe, expect, it } from 'vitest';
import { calculateCarriedBalance } from './carriedBalance';
import { Expense, Income } from '@/types/budget';

function income(date: string, amount: number, status: Income['status'] = 'received'): Income {
  return {
    id: `income-${date}-${amount}`,
    description: 'Receita',
    amount,
    date,
    isRecurring: false,
    status,
  };
}

function expense(date: string, amount: number, status: Expense['status'] = 'paid'): Expense {
  return {
    id: `expense-${date}-${amount}`,
    categoryId: 'category-1',
    description: 'Despesa',
    amount,
    date,
    isFixed: false,
    status,
  };
}

describe('calculateCarriedBalance', () => {
  it('does not transfer a negative balance when the previous month is not overdue', () => {
    const carried = calculateCarriedBalance(
      [income('2026-06-05', 250)],
      [expense('2026-06-10', 1000)],
      new Date(2026, 6, 1),
      new Date(2026, 5, 15),
    );

    expect(carried).toBe(0);
  });

  it('immediately transfers remaining positive credit to the next month', () => {
    const carried = calculateCarriedBalance(
      [income('2026-06-05', 1000)],
      [expense('2026-06-10', 250)],
      new Date(2026, 6, 1),
      new Date(2026, 5, 15),
    );

    expect(carried).toBe(750);
  });

  it('uses carried credit to pay the current invoice before transferring the remaining positive credit', () => {
    const carried = calculateCarriedBalance(
      [income('2026-05-05', 1000)],
      [expense('2026-05-10', 200), expense('2026-06-10', 300)],
      new Date(2026, 6, 1),
      new Date(2026, 5, 15),
    );

    expect(carried).toBe(500);
  });

  it('transfers a positive balance after the previous month is overdue', () => {
    const carried = calculateCarriedBalance(
      [income('2026-05-05', 1000)],
      [expense('2026-05-10', 250)],
      new Date(2026, 5, 1),
      new Date(2026, 5, 1),
    );

    expect(carried).toBe(750);
  });

  it('transfers a negative balance after the previous month is overdue', () => {
    const carried = calculateCarriedBalance(
      [income('2026-05-05', 300)],
      [expense('2026-05-10', 850)],
      new Date(2026, 5, 1),
      new Date(2026, 5, 1),
    );

    expect(carried).toBe(-550);
  });

  it('keeps the transferred balance across overdue months without transactions', () => {
    const carried = calculateCarriedBalance(
      [income('2026-01-05', 500)],
      [],
      new Date(2026, 3, 1),
      new Date(2026, 3, 1),
    );

    expect(carried).toBe(500);
  });

  it('ignores pending values when calculating the transferred balance', () => {
    const carried = calculateCarriedBalance(
      [income('2026-05-05', 700, 'pending')],
      [expense('2026-05-10', 200, 'pending')],
      new Date(2026, 5, 1),
      new Date(2026, 5, 1),
    );

    expect(carried).toBe(0);
  });
});

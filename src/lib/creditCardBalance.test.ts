import { describe, expect, it } from 'vitest';
import { calculateCreditCardMonthlyBalance } from './creditCardBalance';
import { CreditCard, Expense } from '@/types/budget';

const card: CreditCard = {
  id: 'card-1',
  name: 'Teste',
  lastDigits: '1234',
  limit: 5000,
  closingDay: 10,
  dueDay: 20,
  color: 'hsl(215, 80%, 55%)',
};

function expense(id: string, date: string, amount: number): Expense {
  return {
    id,
    categoryId: 'cat-1',
    description: id,
    amount,
    date,
    isFixed: false,
    creditCardId: card.id,
    status: 'paid',
  };
}

describe('calculateCreditCardMonthlyBalance', () => {
  it('uses the previous positive closing balance as the next opening balance', () => {
    const expenses = [
      expense('jan-purchase', '2026-01-05', 382),
      expense('feb-purchase', '2026-02-05', 118),
    ];

    const january = calculateCreditCardMonthlyBalance(card, expenses, new Date(2026, 0, 1));
    const february = calculateCreditCardMonthlyBalance(card, expenses, new Date(2026, 1, 1));

    expect(january.closingBalance).toBe(382);
    expect(february.openingBalance).toBe(january.closingBalance);
    expect(february.closingBalance).toBe(500);
  });

  it('uses the previous negative closing balance as the next opening balance', () => {
    const expenses = [
      expense('jan-refund', '2026-01-06', -90),
      expense('feb-purchase', '2026-02-04', 40),
    ];

    const january = calculateCreditCardMonthlyBalance(card, expenses, new Date(2026, 0, 1));
    const february = calculateCreditCardMonthlyBalance(card, expenses, new Date(2026, 1, 1));

    expect(january.closingBalance).toBe(-90);
    expect(february.openingBalance).toBe(january.closingBalance);
    expect(february.closingBalance).toBe(-50);
  });

  it('carries the balance across a year transition', () => {
    const expenses = [
      expense('dec-purchase', '2025-12-05', 200),
      expense('jan-purchase', '2026-01-05', 50),
    ];

    const december = calculateCreditCardMonthlyBalance(card, expenses, new Date(2025, 11, 1));
    const january = calculateCreditCardMonthlyBalance(card, expenses, new Date(2026, 0, 1));

    expect(december.closingBalance).toBe(200);
    expect(january.openingBalance).toBe(december.closingBalance);
    expect(january.closingBalance).toBe(250);
  });

  it('starts a new card history with zero opening balance', () => {
    const january = calculateCreditCardMonthlyBalance(card, [], new Date(2026, 0, 1));

    expect(january.openingBalance).toBe(0);
    expect(january.monthlyActivity).toBe(0);
    expect(january.closingBalance).toBe(0);
  });
});

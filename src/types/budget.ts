export type CategoryType = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  icon: string;
  monthlyGoal: number;
  color: string;
  type: CategoryType;
}

export type ExpenseStatus = 'paid' | 'pending';
export type IncomeStatus = 'received' | 'pending';

export interface Expense {
  id: string;
  categoryId: string;
  description: string;
  amount: number;
  date: string; // ISO string
  isFixed: boolean;
  creditCardId?: string;
  installments?: number;
  currentInstallment?: number;
  status: ExpenseStatus;
  accountId?: string;
}

export interface Income {
  id: string;
  description: string;
  amount: number;
  date: string; // ISO string
  isRecurring: boolean;
  status: IncomeStatus;
  categoryId?: string;
  accountId?: string;
}

export interface CreditCard {
  id: string;
  name: string;
  lastDigits: string;
  limit: number;
  closingDay: number; // 1-31
  dueDay: number; // 1-31
  color: string;
  accountId?: string;
}

export type AccountType = 'checking' | 'savings' | 'wallet' | 'other';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  icon: string;
  color: string;
  initialBalance: number;
}

export type TabType = 'dashboard' | 'categories' | 'expenses' | 'incomes' | 'cards' | 'accounts' | 'settings';

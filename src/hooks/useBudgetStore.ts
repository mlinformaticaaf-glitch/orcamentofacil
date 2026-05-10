import { useState, useEffect, useCallback, useMemo } from 'react';
import { Category, Expense, Income, CreditCard, Account } from '@/types/budget';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';

export function useBudgetStore() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const fetchAll = async () => {
      const [catRes, expRes, incRes, cardRes, accRes] = await Promise.all([
        supabase.from('categories').select('*').eq('user_id', user.id),
        supabase.from('expenses').select('*').eq('user_id', user.id),
        supabase.from('incomes').select('*').eq('user_id', user.id),
        supabase.from('credit_cards').select('*').eq('user_id', user.id),
        supabase.from('accounts').select('*').eq('user_id', user.id),
      ]);

      if (catRes.error || expRes.error || incRes.error || cardRes.error || accRes.error) {
        toast.error('Erro ao carregar dados. Tente recarregar a página.');
        console.error('Fetch errors:', { catRes: catRes.error, expRes: expRes.error, incRes: incRes.error, cardRes: cardRes.error, accRes: accRes.error });
      }

      setCategories((catRes.data || []).map(c => ({
        id: c.id, name: c.name, icon: c.icon, monthlyGoal: Number(c.monthly_goal), color: c.color, type: (c.type as 'expense' | 'income') || 'expense',
      })));
      setExpenses((expRes.data || []).map(e => ({
        id: e.id, categoryId: e.category_id, description: e.description, amount: Number(e.amount),
        date: e.date, isFixed: e.is_fixed, creditCardId: e.credit_card_id ?? undefined,
        installments: e.installments ?? undefined, currentInstallment: e.current_installment ?? undefined,
        status: (e.status as 'paid' | 'pending') || 'pending',
        accountId: e.account_id ?? undefined,
      })));
      setIncomes((incRes.data || []).map(i => ({
        id: i.id, description: i.description, amount: Number(i.amount), date: i.date, isRecurring: i.is_recurring,
        status: (i.status as 'received' | 'pending') || 'pending',
        categoryId: i.category_id ?? undefined,
        accountId: i.account_id ?? undefined,
      })));
      setCreditCards((cardRes.data || []).map(c => ({
        id: c.id, name: c.name, lastDigits: c.last_digits, limit: Number(c.credit_limit),
        closingDay: c.closing_day, dueDay: c.due_day, color: c.color,
        accountId: c.account_id ?? undefined,
      })));
      setAccounts((accRes.data || []).map((a) => ({
        id: a.id, name: a.name, type: a.type as Account['type'], icon: a.icon, color: a.color,
        initialBalance: Number(a.initial_balance),
      })));
      setLoading(false);
    };

    fetchAll();
  }, [user]);

  // Categories
  const addCategory = useCallback(async (cat: Omit<Category, 'id'>) => {
    if (!user) return;
    const { data, error } = await supabase.from('categories').insert({
      user_id: user.id, name: cat.name, icon: cat.icon, monthly_goal: cat.monthlyGoal, color: cat.color, type: cat.type,
    }).select().single();
    if (error) { toast.error('Erro ao salvar categoria.'); console.error(error); return; }
    if (data) setCategories(prev => [...prev, { id: data.id, name: data.name, icon: data.icon, monthlyGoal: Number(data.monthly_goal), color: data.color, type: (data.type as 'expense' | 'income') || 'expense' }]);
  }, [user]);

  const updateCategory = useCallback(async (cat: Category) => {
    if (!user) return;
    const { error } = await supabase.from('categories').update({
      name: cat.name, icon: cat.icon, monthly_goal: cat.monthlyGoal, color: cat.color, type: cat.type,
    }).eq('id', cat.id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao atualizar categoria.'); console.error(error); return; }
    setCategories(prev => prev.map(c => c.id === cat.id ? cat : c));
  }, [user]);

  const deleteCategory = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('categories').delete().eq('id', id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao excluir categoria.'); console.error(error); return; }
    setCategories(prev => prev.filter(c => c.id !== id));
    setExpenses(prev => prev.filter(e => e.categoryId !== id));
  }, [user]);

  // Expenses
  const addExpense = useCallback(async (exp: Omit<Expense, 'id'>) => {
    if (!user) return;
    // Validate amount
    const amount = Number(exp.amount);
    if (isNaN(amount) || amount === 0) { toast.error('Valor inválido.'); return; }

    const { data, error } = await supabase.from('expenses').insert({
      user_id: user.id, category_id: exp.categoryId, description: exp.description,
      amount, date: exp.date, is_fixed: exp.isFixed,
      credit_card_id: exp.creditCardId ?? null, installments: exp.installments ?? null,
      current_installment: exp.currentInstallment ?? null, status: exp.status || 'pending',
      account_id: exp.accountId ?? null,
    }).select().single();
    if (error) { toast.error('Erro ao salvar despesa.'); console.error(error); return; }
    if (data) setExpenses(prev => [...prev, {
      id: data.id, categoryId: data.category_id, description: data.description,
      amount: Number(data.amount), date: data.date, isFixed: data.is_fixed,
      creditCardId: data.credit_card_id ?? undefined, installments: data.installments ?? undefined,
      currentInstallment: data.current_installment ?? undefined, status: (data.status as 'paid' | 'pending') || 'pending',
      accountId: data.account_id ?? undefined,
    }]);
  }, [user]);

  const updateExpense = useCallback(async (exp: Expense) => {
    if (!user) return;
    const { error } = await supabase.from('expenses').update({
      category_id: exp.categoryId, description: exp.description, amount: exp.amount,
      date: exp.date, is_fixed: exp.isFixed, credit_card_id: exp.creditCardId ?? null,
      installments: exp.installments ?? null, current_installment: exp.currentInstallment ?? null,
      status: exp.status, account_id: exp.accountId ?? null,
    }).eq('id', exp.id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao atualizar despesa.'); console.error(error); return; }
    setExpenses(prev => prev.map(e => e.id === exp.id ? exp : e));
  }, [user]);

  const deleteExpense = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao excluir despesa.'); console.error(error); return; }
    setExpenses(prev => prev.filter(e => e.id !== id));
  }, [user]);

  // Incomes
  const addIncome = useCallback(async (inc: Omit<Income, 'id'>) => {
    if (!user) return;
    // Validate amount
    const amount = Number(inc.amount);
    if (isNaN(amount) || amount === 0) { toast.error('Valor inválido.'); return; }

    const { data, error } = await supabase.from('incomes').insert({
      user_id: user.id, description: inc.description, amount, date: inc.date, is_recurring: inc.isRecurring, status: inc.status || 'pending',
      category_id: inc.categoryId ?? null,
      account_id: inc.accountId ?? null,
    }).select().single();
    if (error) { toast.error('Erro ao salvar receita.'); console.error(error); return; }
    if (data) setIncomes(prev => [...prev, {
      id: data.id, description: data.description, amount: Number(data.amount), date: data.date, isRecurring: data.is_recurring,
      status: (data.status as 'received' | 'pending') || 'pending',
      categoryId: data.category_id ?? undefined,
      accountId: data.account_id ?? undefined,
    }]);
  }, [user]);

  const updateIncome = useCallback(async (inc: Income) => {
    if (!user) return;
    const { error } = await supabase.from('incomes').update({
      description: inc.description, amount: inc.amount, date: inc.date,
      is_recurring: inc.isRecurring, status: inc.status, category_id: inc.categoryId ?? null,
      account_id: inc.accountId ?? null,
    }).eq('id', inc.id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao atualizar receita.'); console.error(error); return; }
    setIncomes(prev => prev.map(i => i.id === inc.id ? inc : i));
  }, [user]);

  const deleteIncome = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('incomes').delete().eq('id', id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao excluir receita.'); console.error(error); return; }
    setIncomes(prev => prev.filter(i => i.id !== id));
  }, [user]);

  // Credit Cards
  const addCreditCard = useCallback(async (card: Omit<CreditCard, 'id'>) => {
    if (!user) return;
    const { data, error } = await supabase.from('credit_cards').insert({
      user_id: user.id, name: card.name, last_digits: card.lastDigits,
      credit_limit: card.limit, closing_day: card.closingDay, due_day: card.dueDay, color: card.color,
      account_id: card.accountId ?? null,
    }).select().single();
    if (error) { toast.error('Erro ao salvar cartão.'); console.error(error); return; }
    if (data) setCreditCards(prev => [...prev, {
      id: data.id, name: data.name, lastDigits: data.last_digits, limit: Number(data.credit_limit),
      closingDay: data.closing_day, dueDay: data.due_day, color: data.color,
      accountId: data.account_id ?? undefined,
    }]);
  }, [user]);

  const updateCreditCard = useCallback(async (card: CreditCard) => {
    if (!user) return;
    const { error } = await supabase.from('credit_cards').update({
      name: card.name, last_digits: card.lastDigits, credit_limit: card.limit,
      closing_day: card.closingDay, due_day: card.dueDay, color: card.color,
      account_id: card.accountId ?? null,
    }).eq('id', card.id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao atualizar cartão.'); console.error(error); return; }
    setCreditCards(prev => prev.map(c => c.id === card.id ? card : c));
  }, [user]);

  const deleteCreditCard = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('credit_cards').delete().eq('id', id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao excluir cartão.'); console.error(error); return; }
    setCreditCards(prev => prev.filter(c => c.id !== id));
  }, [user]);

  // Accounts
  const addAccount = useCallback(async (acc: Omit<Account, 'id'>) => {
    if (!user) return;
    const { data, error } = await supabase.from('accounts').insert({
      user_id: user.id, name: acc.name, type: acc.type, icon: acc.icon, color: acc.color,
      initial_balance: acc.initialBalance,
    }).select().single();
    if (error) { toast.error('Erro ao salvar conta.'); console.error(error); return; }
    if (data) setAccounts(prev => [...prev, {
      id: data.id, name: data.name, type: data.type as Account['type'],
      icon: data.icon, color: data.color,
      initialBalance: Number(data.initial_balance),
    }]);
  }, [user]);

  const updateAccount = useCallback(async (acc: Account) => {
    if (!user) return;
    const { error } = await supabase.from('accounts').update({
      name: acc.name, type: acc.type, icon: acc.icon, color: acc.color,
      initial_balance: acc.initialBalance,
    }).eq('id', acc.id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao atualizar conta.'); console.error(error); return; }
    setAccounts(prev => prev.map(a => a.id === acc.id ? acc : a));
  }, [user]);

  const deleteAccount = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from('accounts').delete().eq('id', id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao excluir conta.'); console.error(error); return; }
    setAccounts(prev => prev.filter(a => a.id !== id));
  }, [user]);

  const getAccountBalance = useCallback((accountId: string) => {
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return 0;

    const incomesTotal = incomes
      .filter(i => i.accountId === accountId && i.status === 'received')
      .reduce((s, i) => s + i.amount, 0);

    const expensesTotal = expenses
      .filter(e => e.accountId === accountId && e.status === 'paid')
      .reduce((s, e) => s + e.amount, 0);

    return acc.initialBalance + incomesTotal - expensesTotal;
  }, [accounts, incomes, expenses]);

  // Toggle status
  const toggleExpenseStatus = useCallback(async (id: string) => {
    const exp = expenses.find(e => e.id === id);
    if (!exp || !user) return;
    const newStatus = exp.status === 'paid' ? 'pending' : 'paid';
    const { error } = await supabase.from('expenses').update({ status: newStatus }).eq('id', id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao atualizar status.'); console.error(error); return; }
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
  }, [expenses, user]);

  const toggleIncomeStatus = useCallback(async (id: string) => {
    const inc = incomes.find(i => i.id === id);
    if (!inc || !user) return;
    const newStatus = inc.status === 'received' ? 'pending' : 'received';
    const { error } = await supabase.from('incomes').update({ status: newStatus }).eq('id', id).eq('user_id', user.id);
    if (error) { toast.error('Erro ao atualizar status.'); console.error(error); return; }
    setIncomes(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
  }, [incomes, user]);

  // Computed values - accept optional month parameter
  const getMonthIncomes = useCallback((month?: Date) => {
    const target = month || new Date();
    const start = startOfMonth(target);
    const end = endOfMonth(target);
    return incomes.filter(i => isWithinInterval(parseISO(i.date), { start, end }));
  }, [incomes]);

  const getMonthExpenses = useCallback((month?: Date) => {
    const target = month || new Date();
    const start = startOfMonth(target);
    const end = endOfMonth(target);
    return expenses.filter(e => isWithinInterval(parseISO(e.date), { start, end }));
  }, [expenses]);

  // Keep backwards-compatible aliases
  const getCurrentMonthIncomes = getMonthIncomes;
  const getCurrentMonthExpenses = getMonthExpenses;

  const getCategorySpending = useCallback((month?: Date) => {
    const current = getMonthExpenses(month);
    return categories.map(cat => {
      const spent = current.filter(e => e.categoryId === cat.id && e.status === 'paid').reduce((s, e) => s + e.amount, 0);
      return { ...cat, spent };
    });
  }, [categories, getMonthExpenses]);

  const getMonthlyTotals = useCallback((monthsBack: number = 6) => {
    const now = new Date();
    return Array.from({ length: monthsBack }, (_, i) => {
      const month = subMonths(now, monthsBack - 1 - i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const total = expenses
        .filter(e => e.status === 'paid' && isWithinInterval(parseISO(e.date), { start, end }))
        .reduce((sum, e) => sum + e.amount, 0);
      return { month: format(month, 'MMM'), total };
    });
  }, [expenses]);

  // Optimized: pre-compute monthly income/expense sums for carried balance
  const getCarriedBalance = useCallback((month: Date) => {
    const target = startOfMonth(month);

    // Pre-group incomes and expenses by YYYY-MM for O(n) instead of O(n*120)
    const incomeByMonth = new Map<string, number>();
    for (const inc of incomes) {
      if (inc.status !== 'received') continue;
      const key = inc.date.substring(0, 7); // YYYY-MM
      incomeByMonth.set(key, (incomeByMonth.get(key) || 0) + inc.amount);
    }
    const expenseByMonth = new Map<string, number>();
    for (const exp of expenses) {
      if (exp.status !== 'paid') continue;
      const key = exp.date.substring(0, 7); // YYYY-MM
      expenseByMonth.set(key, (expenseByMonth.get(key) || 0) + exp.amount);
    }

    let carried = 0;
    for (let i = 1; i <= 120; i++) {
      const m = subMonths(target, i);
      const key = format(m, 'yyyy-MM');
      const mIncome = incomeByMonth.get(key) || 0;
      const mExpense = expenseByMonth.get(key) || 0;
      if (mIncome === 0 && mExpense === 0) break;
      carried += mIncome - mExpense;
    }
    return carried;
  }, [incomes, expenses]);

  const getMonthTotals = useCallback((month?: Date) => {
    const target = month || new Date();
    const monthExpenses = getMonthExpenses(target);
    const monthIncomes = getMonthIncomes(target);
    const totalBudget = categories.reduce((s, c) => s + c.monthlyGoal, 0);
    const totalSpent = monthExpenses.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
    const totalIncome = monthIncomes.filter(i => i.status === 'received').reduce((s, i) => s + i.amount, 0);
    const carriedBalance = getCarriedBalance(target);
    return { totalBudget, totalSpent, totalIncome, carriedBalance };
  }, [getMonthExpenses, getMonthIncomes, categories, getCarriedBalance]);

  const totalBudget = categories.reduce((s, c) => s + c.monthlyGoal, 0);
  const totalSpent = getMonthExpenses().filter(e => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
  const totalIncome = getMonthIncomes().filter(i => i.status === 'received').reduce((s, i) => s + i.amount, 0);

  return {
    categories, expenses, incomes, creditCards, accounts, loading,
    addCategory, updateCategory, deleteCategory,
    addExpense, updateExpense, deleteExpense,
    addIncome, updateIncome, deleteIncome,
    addCreditCard, updateCreditCard, deleteCreditCard,
    addAccount, updateAccount, deleteAccount, getAccountBalance,
    toggleExpenseStatus, toggleIncomeStatus,
    getCurrentMonthExpenses, getCurrentMonthIncomes, getMonthlyTotals,
    getCategorySpending, getMonthTotals, getMonthExpenses, getMonthIncomes,
    totalBudget, totalSpent, totalIncome,
  };
}

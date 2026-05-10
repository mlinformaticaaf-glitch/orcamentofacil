import { useState, useCallback } from 'react';
import { TabType } from '@/types/budget';
import { useBudgetStore } from '@/hooks/useBudgetStore';
import { SummaryCards } from '@/components/SummaryCards';
import { BudgetBarChart, SpendingLineChart } from '@/components/BudgetCharts';
import { CategoryManager } from '@/components/CategoryManager';
import { ExpenseManager } from '@/components/ExpenseManager';
import { IncomeManager } from '@/components/IncomeManager';
import { CreditCardManager } from '@/components/CreditCardManager';
import { AccountManager } from '@/components/AccountManager';
import { SettingsPage } from '@/components/SettingsPage';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { LayoutDashboard, Tags, Receipt, DollarSign, CreditCard, Settings, ChevronLeft, ChevronRight, Landmark } from 'lucide-react';
import { NotificationCenter } from '@/components/NotificationCenter';
import { Button } from '@/components/ui/button';
import { format, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSwipe } from '@/hooks/useSwipe';

const mainTabs: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'incomes', label: 'Receitas', icon: DollarSign },
  { id: 'expenses', label: 'Despesas', icon: Receipt },
  { id: 'cards', label: 'Cartões', icon: CreditCard },
  { id: 'accounts', label: 'Contas', icon: Landmark },
];

const secondaryTabs: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: 'categories', label: 'Categorias', icon: Tags },
  { id: 'settings', label: 'Ajustes', icon: Settings },
];

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [activeNavPage, setActiveNavPage] = useState(0);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [incomeFormOpen, setIncomeFormOpen] = useState(false);
  const [dashboardMonth, setDashboardMonth] = useState(new Date());
  const store = useBudgetStore();

  const prevMonth = useCallback(() => setDashboardMonth(m => subMonths(m, 1)), []);
  const nextMonth = useCallback(() => setDashboardMonth(m => addMonths(m, 1)), []);
  const dashSwipe = useSwipe({ onSwipeLeft: nextMonth, onSwipeRight: prevMonth });

  const dashTotals = store.getMonthTotals(dashboardMonth);

  return (
    <div className="min-h-screen pb-24 sm:pb-0" {...dashSwipe}>
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src="/pwa-192x192.png" alt="Orçamento Fácil" className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl" />
            <h1 className="font-display font-bold text-lg sm:text-xl">Orçamento Fácil</h1>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter
              expenses={store.expenses}
              incomes={store.incomes}
              creditCards={store.creditCards}
              onNavigateToCards={() => setActiveTab('cards')}
              onNavigateToExpenses={() => setActiveTab('expenses')}
            />
            <nav className="hidden sm:flex gap-1 bg-card/50 backdrop-blur-xl border border-border rounded-full p-1 overflow-x-auto flex-shrink-0">
              {[...mainTabs, ...secondaryTabs].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <tab.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {activeTab === 'dashboard' && (
          <div>
            <div className="flex items-center justify-center mb-4">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={prevMonth}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-base font-semibold min-w-[130px] text-center capitalize">
                  {format(dashboardMonth, 'MMMM yyyy', { locale: ptBR })}
                </span>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={nextMonth}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-4 sm:space-y-6">
              <SummaryCards totalSpent={dashTotals.totalSpent} totalBudget={dashTotals.totalBudget} totalIncome={dashTotals.totalIncome} carriedBalance={dashTotals.carriedBalance} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BudgetBarChart data={store.getCategorySpending(dashboardMonth)} />
                <SpendingLineChart data={store.getMonthlyTotals()} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <CategoryManager categories={store.categories} onAdd={store.addCategory} onUpdate={store.updateCategory} onDelete={store.deleteCategory} />
        )}

        {activeTab === 'incomes' && (
          <IncomeManager incomes={store.incomes} categories={store.categories} accounts={store.accounts} onAdd={store.addIncome} onUpdate={store.updateIncome} onDelete={store.deleteIncome} onToggleStatus={store.toggleIncomeStatus} externalOpen={incomeFormOpen} onExternalOpenChange={setIncomeFormOpen} />
        )}

        {activeTab === 'expenses' && (
          <ExpenseManager expenses={store.expenses} categories={store.categories} creditCards={store.creditCards} accounts={store.accounts} onAdd={store.addExpense} onUpdate={store.updateExpense} onDelete={store.deleteExpense} onToggleStatus={store.toggleExpenseStatus} externalOpen={expenseFormOpen} onExternalOpenChange={setExpenseFormOpen} />
        )}

        {activeTab === 'cards' && (
          <CreditCardManager cards={store.creditCards} expenses={store.expenses} categories={store.categories} accounts={store.accounts} onAddCard={store.addCreditCard} onUpdateCard={store.updateCreditCard} onDeleteCard={store.deleteCreditCard} onAddExpense={store.addExpense} onUpdateExpense={store.updateExpense} onDeleteExpense={store.deleteExpense} />
        )}

        {activeTab === 'accounts' && (
          <AccountManager accounts={store.accounts} expenses={store.expenses} incomes={store.incomes} onAdd={store.addAccount} onUpdate={store.updateAccount} onDelete={store.deleteAccount} getBalance={store.getAccountBalance} />
        )}

        {activeTab === 'settings' && <SettingsPage onDataCleared={() => window.location.reload()} categories={store.categories} expenses={store.expenses} incomes={store.incomes} onAddExpense={store.addExpense} onAddIncome={store.addIncome} />}
      </main>

      {/* FAB - only on dashboard */}
      {activeTab === 'dashboard' && (
        <FloatingActionButton
          categories={store.categories}
          onAddExpense={store.addExpense}
          onAddIncome={store.addIncome}
          onOpenExpenseForm={() => { setActiveTab('expenses'); setExpenseFormOpen(true); }}
          onOpenIncomeForm={() => { setActiveTab('incomes'); setIncomeFormOpen(true); }}
        />
      )}

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-20 safe-bottom px-3 pb-2">
        <div className="relative">
          {/* Pagination dots */}
          <div className="absolute -top-3 left-0 right-0 flex justify-center gap-1.5 z-10">
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeNavPage === 0 ? 'bg-primary' : 'bg-foreground/20'}`}></div>
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeNavPage === 1 ? 'bg-primary' : 'bg-foreground/20'}`}></div>
          </div>
          
          <div 
            className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] py-2 bg-card/90 backdrop-blur-xl border border-border rounded-[2rem] shadow-sm relative z-10"
            onScroll={(e) => {
              const scrollLeft = e.currentTarget.scrollLeft;
              const width = e.currentTarget.clientWidth;
              setActiveNavPage(Math.round(scrollLeft / width));
            }}
          >
            {/* Page 1 */}
            <div className="w-full flex-shrink-0 flex justify-around snap-center px-1">
              {mainTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-full text-xs font-medium transition-all min-w-0 ${
                    activeTab === tab.id ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                  <span className="truncate text-[10px]">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Page 2 */}
            <div className="w-full flex-shrink-0 flex justify-around snap-center px-1">
              {secondaryTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-full text-xs font-medium transition-all min-w-0 ${
                    activeTab === tab.id ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                  <span className="truncate text-[10px]">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Index;

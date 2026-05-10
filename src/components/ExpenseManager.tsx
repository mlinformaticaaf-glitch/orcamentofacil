import { useState, useEffect, useCallback } from 'react';
import { Category, Expense, CreditCard as CreditCardType, ExpenseStatus } from '@/types/budget';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, CalendarIcon, Repeat, ChevronLeft, ChevronRight, CheckCircle2, Clock, Search, Filter, CreditCard as CreditCardIcon, ChevronDown, ChevronUp, Receipt } from 'lucide-react';
import { PageFAB } from '@/components/PageFAB';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSwipe } from '@/hooks/useSwipe';

interface Props {
  expenses: Expense[];
  categories: Category[];
  creditCards: CreditCardType[];
  accounts?: { id: string; name: string }[];
  onAdd: (exp: Omit<Expense, 'id'>) => void;
  onUpdate: (exp: Expense) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ExpenseManager({ expenses, categories, creditCards, accounts = [], onAdd, onUpdate, onDelete, onToggleStatus, externalOpen, onExternalOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  useEffect(() => {
    if (externalOpen) { setOpen(true); onExternalOpenChange?.(false); }
  }, [externalOpen, onExternalOpenChange]);
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [isFixed, setIsFixed] = useState(false);
  const [creditCardId, setCreditCardId] = useState('none');
  const [installments, setInstallments] = useState('1');
  const [status, setStatus] = useState<ExpenseStatus>('pending');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accountId, setAccountId] = useState<string>('none');

  // Delete installment confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const getBaseDescription = (desc: string) => desc.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();

  const findRelatedInstallments = (exp: Expense) => {
    if (!exp.installments || !exp.creditCardId) return [];
    const base = getBaseDescription(exp.description);
    return expenses.filter(e =>
      e.id !== exp.id &&
      e.creditCardId === exp.creditCardId &&
      e.installments === exp.installments &&
      e.amount === exp.amount &&
      getBaseDescription(e.description) === base
    );
  };

  const handleDeleteExpense = (exp: Expense) => {
    if (exp.installments && exp.installments > 1 && exp.creditCardId) {
      setDeleteTarget(exp);
      setDeleteConfirmOpen(true);
    } else {
      onDelete(exp.id);
    }
  };

  const handleDeleteConfirm = (deleteAll: boolean) => {
    if (!deleteTarget) return;
    if (deleteAll) {
      const related = findRelatedInstallments(deleteTarget);
      onDelete(deleteTarget.id);
      related.forEach(e => onDelete(e.id));
    } else {
      onDelete(deleteTarget.id);
    }
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

  const handleOpenEdit = (exp: Expense) => {
    setEditing(exp);
    setDescription(exp.description);
    setAmount(String(exp.amount));
    setCategoryId(exp.categoryId);
    setDate(parseISO(exp.date));
    setIsFixed(exp.isFixed);
    setCreditCardId(exp.creditCardId || 'none');
    setInstallments(String(exp.installments || 1));
    setStatus(exp.status);
    setAccountId(exp.accountId || 'none');
    setOpen(true);
  };

  const handleOpenNew = () => {
    setEditing(null);
    setDescription('');
    setAmount('');
    setCategoryId('');
    setDate(new Date());
    setIsFixed(false);
    setCreditCardId('none');
    setInstallments('1');
    setStatus('pending');
    setAccountId('none');
    setOpen(true);
  };

  const handleSave = () => {
    if (!categoryId || !amount || !description) return;

    if (editing) {
      onUpdate({
        ...editing,
        categoryId,
        description,
        amount: Number(amount),
        date: format(date, 'yyyy-MM-dd'),
        isFixed,
        creditCardId: creditCardId !== 'none' ? creditCardId : undefined,
        installments: editing.installments,
        currentInstallment: editing.currentInstallment,
        status,
        accountId: accountId !== 'none' ? accountId : undefined,
      });
    } else {
      const numInstallments = Math.max(1, Number(installments));
      const installmentAmount = Number(amount) / numInstallments;

      for (let i = 0; i < numInstallments; i++) {
        const expDate = new Date(date);
        expDate.setMonth(expDate.getMonth() + i);
        onAdd({
          categoryId,
          description: numInstallments > 1 ? `${description} (${i + 1}/${numInstallments})` : description,
          amount: Math.round(installmentAmount * 100) / 100,
          date: format(expDate, 'yyyy-MM-dd'),
          isFixed,
          creditCardId: creditCardId !== 'none' ? creditCardId : undefined,
          installments: numInstallments > 1 ? numInstallments : undefined,
          currentInstallment: numInstallments > 1 ? i + 1 : undefined,
          status,
          accountId: accountId !== 'none' ? accountId : undefined,
        });
      }
    }

    setOpen(false);
    setEditing(null);
    setDescription('');
    setAmount('');
    setCategoryId('');
    setIsFixed(false);
    setCreditCardId('none');
    setInstallments('1');
    setStatus('pending');
    setAccountId('none');
  };

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const filtered = expenses.filter(e => {
    if (!isWithinInterval(parseISO(e.date), { start: monthStart, end: monthEnd })) return false;
    if (searchTerm && !e.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && e.categoryId !== categoryFilter) return false;
    return true;
  });

  // Separate non-card expenses and group card expenses by card
  const nonCardExpenses = filtered.filter(e => !e.creditCardId);
  const cardExpensesMap = new Map<string, Expense[]>();
  filtered.filter(e => e.creditCardId).forEach(e => {
    const list = cardExpensesMap.get(e.creditCardId!) || [];
    list.push(e);
    cardExpensesMap.set(e.creditCardId!, list);
  });

  const sortedNonCard = [...nonCardExpenses].sort((a, b) => b.date.localeCompare(a.date));
  const monthTotal = filtered.reduce((s, e) => s + e.amount, 0);

  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toggleCardExpanded = (cardId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
      return next;
    });
  };

  const prevMonth = useCallback(() => setSelectedMonth(m => subMonths(m, 1)), []);
  const nextMonth = useCallback(() => setSelectedMonth(m => addMonths(m, 1)), []);
  const swipeHandlers = useSwipe({ onSwipeLeft: nextMonth, onSwipeRight: prevMonth });

  return (
    <div className="space-y-4 flex-1" style={{ minHeight: 'calc(100vh - 10rem)' }} {...swipeHandlers}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-display font-bold">Despesas</h2>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedMonth(m => subMonths(m, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium min-w-[100px] text-center capitalize">
              {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedMonth(m => addMonths(m, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <span className="text-sm text-muted-foreground hidden sm:inline">Total: {formatCurrency(monthTotal)}</span>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{editing ? 'Editar' : 'Nova'} Despesa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Descrição</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Supermercado" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(date, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="fixed" checked={isFixed} onCheckedChange={(v) => setIsFixed(v === true)} />
                <Label htmlFor="fixed" className="cursor-pointer">Despesa fixa (repete mensalmente)</Label>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ExpenseStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">
                      <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Paga</span>
                    </SelectItem>
                    <SelectItem value="pending">
                      <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> A pagar</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {creditCards.length > 0 && (
                <div>
                  <Label>Cartão de Crédito</Label>
                  <Select value={creditCardId} onValueChange={setCreditCardId}>
                    <SelectTrigger><SelectValue placeholder="Sem cartão" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem cartão</SelectItem>
                      {creditCards.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name} •••• {c.lastDigits}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!editing && creditCardId !== 'none' && (
                <div>
                  <Label>Parcelas</Label>
                  <Input type="number" value={installments} onChange={e => setInstallments(e.target.value)} min={1} max={48} />
                </div>
               )}
              {accounts.length > 0 && (
                <div>
                  <Label>Conta</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma conta (opcional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem conta</SelectItem>
                      {accounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={(e) => { e.stopPropagation(); handleSave(); }} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[150px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar despesa..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'paid' | 'pending')}>
          <SelectTrigger className="w-[130px] h-9 text-sm">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="paid">Pagas</SelectItem>
            <SelectItem value="pending">A pagar</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {sortedNonCard.length === 0 && cardExpensesMap.size === 0 && (
          <Card className="glass-card p-8 text-center text-muted-foreground">
            Nenhuma despesa registrada. Clique em "Nova Despesa" para começar.
          </Card>
        )}

        {/* Credit card invoice lines */}
        {Array.from(cardExpensesMap.entries()).map(([cardId, cardExps]) => {
          const card = creditCards.find(c => c.id === cardId);
          const invoiceTotal = cardExps.reduce((s, e) => s + e.amount, 0);
          const isExpanded = expandedCards.has(cardId);
          const sortedCardExps = [...cardExps].sort((a, b) => b.date.localeCompare(a.date));
          const allPaid = cardExps.every(e => e.status === 'paid');
          return (
            <div key={cardId}>
              <Card
                className={cn("glass-card p-4 flex items-center gap-3 cursor-pointer transition-colors", !allPaid && "opacity-80")}
                onClick={() => toggleCardExpanded(cardId)}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: (card?.color || 'hsl(215,80%,55%)') + '20' }}>
                  <CreditCardIcon className="w-5 h-5" style={{ color: card?.color || 'hsl(215,80%,55%)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium break-words whitespace-normal">Fatura {card ? `${card.name} •••• ${card.lastDigits}` : 'Cartão'}</p>
                  <p className="text-sm text-muted-foreground">
                    {cardExps.length} lançamento{cardExps.length !== 1 ? 's' : ''} · {allPaid ? 'Paga' : 'Aberta'}
                  </p>
                </div>
                {!allPaid && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1.5 text-xs h-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Pagar fatura</span>
                        <span className="sm:hidden">Pagar</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Pagar fatura inteira?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Todos os {cardExps.filter(exp => exp.status !== 'paid').length} lançamentos pendentes ({formatCurrency(cardExps.filter(exp => exp.status !== 'paid').reduce((s, e) => s + e.amount, 0))}) serão marcados como pagos.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => cardExps.filter(exp => exp.status !== 'paid').forEach(exp => onToggleStatus(exp.id))}>
                          Confirmar pagamento
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <p className="font-semibold shrink-0">{formatCurrency(invoiceTotal)}</p>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </Card>
              {isExpanded && (
                <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-3">
                  {sortedCardExps.map(exp => {
                    const cat = categories.find(c => c.id === exp.categoryId);
                    return (
                      <Card key={exp.id} className={cn("glass-card p-3 flex items-center gap-2.5 group cursor-pointer transition-colors text-sm", exp.status === 'pending' && "opacity-60")} onClick={() => handleOpenEdit(exp)}>
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat?.color || 'hsl(215,80%,55%)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium break-words whitespace-normal text-sm">{exp.description}</p>
                          <p className="text-xs text-muted-foreground">{cat?.name} · {format(parseISO(exp.date), 'dd/MM')}</p>
                        </div>
                        <p className="font-medium shrink-0 text-sm">{formatCurrency(exp.amount)}</p>
                        <Button size="icon" variant="ghost" className="h-7 w-7 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-destructive shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteExpense(exp); }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Non-card expenses */}
        {sortedNonCard.map(exp => {
          const cat = categories.find(c => c.id === exp.categoryId);
          return (
            <Card key={exp.id} className={cn("glass-card p-4 flex items-center gap-3 group cursor-pointer transition-colors", exp.status === 'pending' && "opacity-60")} onClick={() => handleOpenEdit(exp)}>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", exp.status === 'paid' ? "" : "bg-muted")} style={exp.status === 'paid' ? { backgroundColor: (cat?.color || 'hsl(215,80%,55%)') + '20' } : undefined}>
                {exp.status === 'paid' ? (
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat?.color }} />
                ) : (
                  <Clock className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium break-words whitespace-normal">{exp.description}</p>
                  {exp.isFixed && <Repeat className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                </div>
                <p className="text-sm text-muted-foreground">
                  {cat?.name} · {format(parseISO(exp.date), 'dd/MM/yyyy')} · {exp.status === 'paid' ? 'Paga' : 'A pagar'}
                </p>
              </div>
              <p className="font-semibold shrink-0">{formatCurrency(exp.amount)}</p>
              <Button size="icon" variant="ghost" className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-destructive shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteExpense(exp); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </Card>
          );
        })}
      </div>

      {/* Delete installment confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir parcela</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="font-medium text-foreground">{deleteTarget.description}</span>
                  {' — '}Esta compra tem {deleteTarget.installments} parcelas. Deseja excluir apenas esta parcela ou todas?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => handleDeleteConfirm(false)}>
              Apenas esta parcela
            </AlertDialogAction>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDeleteConfirm(true)}>
              Todas as parcelas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageFAB
        newLabel="Nova Despesa"
        newIcon={<Receipt className="w-5 h-5 text-primary" />}
        onNew={handleOpenNew}
        categories={categories}
        onAddExpense={onAdd}
        onAddIncome={undefined}
      />
    </div>
  );
}

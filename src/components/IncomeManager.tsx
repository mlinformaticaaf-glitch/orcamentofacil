import { useState, useEffect, useCallback } from 'react';
import { Income, IncomeStatus, Category } from '@/types/budget';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, CalendarIcon, Repeat, ChevronLeft, ChevronRight, CheckCircle2, Clock, Search, Filter, DollarSign } from 'lucide-react';
import { PageFAB } from '@/components/PageFAB';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSwipe } from '@/hooks/useSwipe';

interface Props {
  incomes: Income[];
  categories: Category[];
  accounts?: { id: string; name: string }[];
  onAdd: (inc: Omit<Income, 'id'>) => void;
  onUpdate: (inc: Income) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function IncomeManager({ incomes, categories, accounts = [], onAdd, onUpdate, onDelete, onToggleStatus, externalOpen, onExternalOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);

  useEffect(() => {
    if (externalOpen) { setOpen(true); onExternalOpenChange?.(false); }
  }, [externalOpen, onExternalOpenChange]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [isRecurring, setIsRecurring] = useState(false);
  const [status, setStatus] = useState<IncomeStatus>('pending');
  const [categoryId, setCategoryId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'received' | 'pending'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accountId, setAccountId] = useState<string>('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const incomeCategories = categories.filter(c => c.type === 'income');

  const handleOpenEdit = (inc: Income) => {
    setEditing(inc);
    setDescription(inc.description);
    setAmount(String(inc.amount));
    setDate(parseISO(inc.date));
    setIsRecurring(inc.isRecurring);
    setStatus(inc.status);
    setCategoryId(inc.categoryId || '');
    setAccountId(inc.accountId || '');
    setOpen(true);
  };

  const handleOpenNew = () => {
    setEditing(null);
    setDescription('');
    setAmount('');
    setDate(new Date());
    setIsRecurring(false);
    setStatus('pending');
    setCategoryId('');
    setAccountId('');
    setOpen(true);
  };

  const handleSave = () => {
    if (!amount || !description) return;
    if (editing) {
      onUpdate({
        ...editing,
        description,
        amount: Number(amount),
        date: format(date, 'yyyy-MM-dd'),
        isRecurring,
        status,
        categoryId: categoryId && categoryId !== 'none' ? categoryId : undefined,
        accountId: accountId && accountId !== 'none' ? accountId : undefined,
      });
    } else {
      onAdd({
        description,
        amount: Number(amount),
        date: format(date, 'yyyy-MM-dd'),
        isRecurring,
        status,
        categoryId: categoryId && categoryId !== 'none' ? categoryId : undefined,
        accountId: accountId && accountId !== 'none' ? accountId : undefined,
      });
    }
    setOpen(false);
    setEditing(null);
    setDescription('');
    setAmount('');
    setIsRecurring(false);
    setStatus('pending');
    setCategoryId('');
    setAccountId('');
  };

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const filtered = incomes.filter(i => {
    if (!isWithinInterval(parseISO(i.date), { start: monthStart, end: monthEnd })) return false;
    if (searchTerm && !i.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && (i.categoryId || '') !== categoryFilter) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const monthTotal = filtered.reduce((s, i) => s + i.amount, 0);

  const prevMonth = useCallback(() => setSelectedMonth(m => subMonths(m, 1)), []);
  const nextMonth = useCallback(() => setSelectedMonth(m => addMonths(m, 1)), []);
  const swipeHandlers = useSwipe({ onSwipeLeft: nextMonth, onSwipeRight: prevMonth });

  return (
    <div className="space-y-4 flex-1" style={{ minHeight: 'calc(100vh - 10rem)' }} {...swipeHandlers}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-display font-bold">Receitas</h2>
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
              <DialogTitle className="font-display">{editing ? 'Editar' : 'Nova'} Receita</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Descrição</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Salário" />
              </div>
              {incomeCategories.length > 0 && (
                <div>
                  <Label>Categoria</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {incomeCategories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                <Checkbox id="recurring" checked={isRecurring} onCheckedChange={(v) => setIsRecurring(v === true)} />
                <Label htmlFor="recurring" className="cursor-pointer">Receita recorrente (repete mensalmente)</Label>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as IncomeStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received">
                      <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Recebida</span>
                    </SelectItem>
                    <SelectItem value="pending">
                      <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> A receber</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            placeholder="Buscar receita..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'received' | 'pending')}>
          <SelectTrigger className="w-[130px] h-9 text-sm">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="received">Recebidas</SelectItem>
            <SelectItem value="pending">A receber</SelectItem>
          </SelectContent>
        </Select>
        {incomeCategories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {incomeCategories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        {sorted.length === 0 && (
          <Card className="glass-card p-8 text-center text-muted-foreground">
            Nenhuma receita registrada. Clique em "Nova Receita" para começar.
          </Card>
        )}
        {sorted.map(inc => (
          <Card key={inc.id} className={cn("glass-card p-4 flex items-center gap-3 group cursor-pointer transition-colors", inc.status === 'pending' && "opacity-60")} onClick={() => handleOpenEdit(inc)}>
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", inc.status === 'received' ? "bg-success/10" : "bg-muted")}>
              {inc.status === 'received' ? <CheckCircle2 className="w-5 h-5 text-success" /> : <Clock className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium break-words whitespace-normal">{inc.description}</p>
                {inc.isRecurring && <Repeat className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              </div>
              <p className="text-sm text-muted-foreground">
                {format(parseISO(inc.date), 'dd/MM/yyyy')} · {inc.status === 'received' ? 'Recebida' : 'A receber'}
                {inc.categoryId && (() => { const cat = categories.find(c => c.id === inc.categoryId); return cat ? ` · ${cat.name}` : ''; })()}
              </p>
            </div>
            <p className="font-semibold shrink-0 text-success">{formatCurrency(inc.amount)}</p>
            <Button size="icon" variant="ghost" className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-destructive shrink-0" onClick={(e) => { e.stopPropagation(); setDeleteTargetId(inc.id); }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </Card>
        ))}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={(v) => { if (!v) setDeleteTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir receita?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta receita será permanentemente excluída. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTargetId) { onDelete(deleteTargetId); setDeleteTargetId(null); } }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageFAB
        newLabel="Nova Receita"
        newIcon={<DollarSign className="w-5 h-5 text-primary" />}
        onNew={handleOpenNew}
        categories={categories}
        onAddExpense={undefined}
        onAddIncome={onAdd}
      />
    </div>
  );
}

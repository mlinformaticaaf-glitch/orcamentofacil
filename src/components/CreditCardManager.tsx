import { useState, useRef } from 'react';
import { CreditCard as CreditCardType, Expense, Category, Account } from '@/types/budget';
import { useSwipe } from '@/hooks/useSwipe';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Trash2, CreditCard as CreditCardIcon, ChevronLeft, ChevronRight, Upload, FileText, Loader2, ArrowLeft, ArrowRight, CheckCircle2, Sparkles, Copy, Pencil, Repeat, CalendarIcon, ShoppingCart, RotateCcw } from 'lucide-react';
import { PageFAB } from '@/components/PageFAB';
import { format, parseISO, addMonths, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ParsedCardTransaction {
  date: string;
  description: string;
  amount: number;
  categoryId?: string;
  selected: boolean;
  isDuplicate: boolean;
  installments?: number;
  currentInstallment?: number;
}

function detectInstallments(description: string): { installments?: number; currentInstallment?: number; cleanDescription: string } {
  // Match patterns like "1/10", "01/12", "PARCELA 3 DE 10", "3/10"
  const match = description.match(/(\d{1,2})\s*[\/de]{1,2}\s*(\d{1,2})(?:\s*parcela)?/i)
    || description.match(/parcela\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})/i);
  if (match) {
    const current = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);
    if (total >= 2 && total <= 99 && current >= 1 && current <= total) {
      const clean = description
        .replace(match[0], '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s*[-–·]\s*/, '')
        .trim();
      return { installments: total, currentInstallment: current, cleanDescription: clean || description };
    }
  }
  return { cleanDescription: description };
}

interface Props {
  cards: CreditCardType[];
  expenses: Expense[];
  categories: Category[];
  accounts?: Account[];
  onAddCard: (card: Omit<CreditCardType, 'id'>) => void;
  onUpdateCard: (card: CreditCardType) => void;
  onDeleteCard: (id: string) => void;
  onAddExpense: (exp: Omit<Expense, 'id'>) => void;
  onUpdateExpense: (exp: Expense) => void;
  onDeleteExpense: (id: string) => void;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const CARD_COLORS = [
  'hsl(215, 80%, 55%)',
  'hsl(280, 65%, 55%)',
  'hsl(0, 72%, 51%)',
  'hsl(38, 92%, 50%)',
  'hsl(152, 69%, 40%)',
  'hsl(330, 70%, 50%)',
];

export function CreditCardManager({ cards, expenses, categories, accounts = [], onAddCard, onUpdateCard, onDeleteCard, onAddExpense, onUpdateExpense, onDeleteExpense }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCardType | null>(null);
  const [name, setName] = useState('');
  const [lastDigits, setLastDigits] = useState('');
  const [limit, setLimit] = useState('');
  const [closingDay, setClosingDay] = useState('10');
  const [dueDay, setDueDay] = useState('20');
  const [color, setColor] = useState(CARD_COLORS[0]);
  const [cardAccountId, setCardAccountId] = useState<string>('none');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [partialPayOpen, setPartialPayOpen] = useState<string | null>(null);
  const [partialPayAmount, setPartialPayAmount] = useState('');

  // New purchase state
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseCardId, setPurchaseCardId] = useState('');
  const [purchaseDesc, setPurchaseDesc] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState<Date>(new Date());
  const [purchaseCategoryId, setPurchaseCategoryId] = useState('');
  const [purchaseInstallments, setPurchaseInstallments] = useState('1');
  const [purchaseIsRefund, setPurchaseIsRefund] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleteCardConfirmOpen, setDeleteCardConfirmOpen] = useState(false);
  const [deleteCardStep, setDeleteCardStep] = useState<1 | 2>(1);

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [importCardId, setImportCardId] = useState<string>('');
  const [importLoading, setImportLoading] = useState(false);
  const [importCategorizing, setImportCategorizing] = useState(false);
  const [importTransactions, setImportTransactions] = useState<ParsedCardTransaction[]>([]);
  const [importStep, setImportStep] = useState<'select' | 'review' | 'done'>('select');
  const [importingData, setImportingData] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const expenseCategories = categories.filter(c => c.type === 'expense');
  const incomeCategories = categories.filter(c => c.type === 'income');
  const defaultCategoryId = expenseCategories[0]?.id || '';
  const refundCategoryId = categories.find(c => c.type === 'income' && c.name.trim().toLowerCase() === 'estornos')?.id || defaultCategoryId;
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

  // ---- Card CRUD handlers ----
  const handleOpenEdit = (card: CreditCardType) => {
    setEditing(card);
    setName(card.name);
    setLastDigits(card.lastDigits);
    setLimit(String(card.limit));
    setClosingDay(String(card.closingDay));
    setDueDay(String(card.dueDay));
    setColor(card.color);
    setCardAccountId(card.accountId || 'none');
    setOpen(true);
  };

  const handleOpenNew = () => {
    setEditing(null);
    setName('');
    setLastDigits('');
    setLimit('');
    setClosingDay('10');
    setDueDay('20');
    setColor(CARD_COLORS[0]);
    setCardAccountId('none');
    setOpen(true);
  };

  const handleSave = () => {
    if (!name || !limit || !lastDigits) return;
    const cardData = {
      name,
      lastDigits: lastDigits.slice(0, 4),
      limit: Number(limit),
      closingDay: Math.min(31, Math.max(1, Number(closingDay))),
      dueDay: Math.min(31, Math.max(1, Number(dueDay))),
      color,
      accountId: cardAccountId !== 'none' ? cardAccountId : undefined,
    };
    if (editing) {
      onUpdateCard({ ...cardData, id: editing.id });
    } else {
      onAddCard(cardData);
    }
    setOpen(false);
    setEditing(null);
  };

  // ---- Import handlers ----
  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'ofx', 'qfx'].includes(ext || '')) {
      toast.error('Formato não suportado. Use CSV, OFX ou QFX.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Limite de 5MB.');
      return;
    }

    setImportLoading(true);
    try {
      const content = await file.text();
      const fileFormat = ext === 'csv' ? 'csv' : 'ofx';

      const { data, error } = await supabase.functions.invoke('parse-statement', {
        body: { content, format: fileFormat },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); setImportLoading(false); return; }

      const existingKeys = new Set(
        expenses
          .filter(ex => ex.creditCardId === importCardId)
          .map(ex => `${ex.date}|${normalize(ex.description)}|${ex.amount}`)
      );

      // Transactions from a card statement: negative = expense, positive = refund/credit
      const parsed: ParsedCardTransaction[] = (data.transactions || []).map((t: any) => {
        const isRefund = t.type === 'income'; // positive amounts from OFX are credits/refunds
        const amt = isRefund ? -Math.abs(t.amount) : Math.abs(t.amount); // refunds stored as negative
        const { installments, currentInstallment, cleanDescription } = detectInstallments(t.description);
        const key = `${t.date}|${normalize(t.description)}|${amt}`;
        const isDuplicate = existingKeys.has(key);
        return {
          date: t.date,
          description: cleanDescription,
          amount: amt,
          categoryId: isRefund ? refundCategoryId : defaultCategoryId,
          selected: !isDuplicate,
          isDuplicate,
          installments: isRefund ? undefined : installments,
          currentInstallment: isRefund ? undefined : currentInstallment,
        };
      });

      const dupeCount = parsed.filter(t => t.isDuplicate).length;
      setImportTransactions(parsed);
      setImportStep('review');
      toast.success(`${parsed.length} lançamentos encontrados!${dupeCount > 0 ? ` ${dupeCount} duplicata(s).` : ''}`);
    } catch (err: any) {
      console.error('Card import error:', err);
      toast.error('Erro ao processar arquivo.');
    } finally {
      setImportLoading(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleImportAICategorize = async () => {
    if (categories.length === 0) { toast.error('Crie categorias primeiro.'); return; }
    setImportCategorizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('categorize-transactions', {
        body: {
          transactions: importTransactions.map(t => ({ description: t.description, amount: t.amount, type: 'expense' })),
          categories: categories.map(c => ({ id: c.id, name: c.name, type: c.type })),
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      const categorizations: { index: number; categoryId: string }[] = data.categorizations || [];
      setImportTransactions(prev => {
        const updated = [...prev];
        for (const cat of categorizations) {
          if (cat.index >= 0 && cat.index < updated.length) {
            // Don't override refund category — keep refundCategoryId for refunds
            if (updated[cat.index].amount < 0) continue;
            updated[cat.index] = { ...updated[cat.index], categoryId: cat.categoryId };
          }
        }
        return updated;
      });
      toast.success(`${categorizations.length} lançamentos categorizados!`);
    } catch {
      toast.error('Erro ao categorizar.');
    } finally {
      setImportCategorizing(false);
    }
  };

  const handleImportConfirm = async () => {
    const selected = importTransactions.filter(t => t.selected);
    if (selected.length === 0) { toast.error('Selecione ao menos um lançamento.'); return; }

    setImportingData(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let totalCreated = 0;

      for (const t of selected) {
        const isRefund = t.amount < 0;
        const hasInstallments = !isRefund && t.installments && t.currentInstallment && t.installments >= 2;

        if (hasInstallments) {
          const remaining = t.installments! - t.currentInstallment! + 1;
          for (let i = 0; i < remaining; i++) {
            const installDate = addMonths(parseISO(t.date), i);
            const installNum = t.currentInstallment! + i;
            const invoiceDate = getInvoiceDate(installDate, importCardId);
            const txDate = new Date(invoiceDate);
            await onAddExpense({
              categoryId: t.categoryId || defaultCategoryId,
              description: t.description,
              amount: t.amount,
              date: invoiceDate,
              isFixed: false,
              creditCardId: importCardId,
              installments: t.installments,
              currentInstallment: installNum,
              status: txDate > today ? 'pending' : 'paid',
            });
            totalCreated++;
            await new Promise(r => setTimeout(r, 30));
          }
        } else {
          const invoiceDate = isRefund ? t.date : getInvoiceDate(parseISO(t.date), importCardId);
          const txDate = new Date(invoiceDate);
          await onAddExpense({
            categoryId: t.categoryId || defaultCategoryId,
            description: t.description,
            amount: t.amount,
            date: invoiceDate,
            isFixed: false,
            creditCardId: importCardId,
            status: isRefund ? 'paid' : (txDate > today ? 'pending' : 'paid'),
          });
          totalCreated++;
          await new Promise(r => setTimeout(r, 30));
        }
      }
      toast.success(`${totalCreated} lançamentos importados!`);
      setImportStep('done');
    } catch {
      toast.error('Erro ao importar.');
    } finally {
      setImportingData(false);
    }
  };

  const handleImportClose = () => {
    setImportOpen(false);
    setTimeout(() => { setImportStep('select'); setImportTransactions([]); setImportCardId(''); }, 300);
  };

  const handleOpenPurchase = (cardId: string, isRefund = false) => {
    setEditingExpense(null);
    setPurchaseCardId(cardId);
    setPurchaseDesc('');
    setPurchaseAmount('');
    setPurchaseDate(new Date());
    setPurchaseCategoryId(isRefund ? refundCategoryId : (expenseCategories[0]?.id || ''));
    setPurchaseInstallments('1');
    setPurchaseIsRefund(isRefund);
    setPurchaseOpen(true);
  };

  const handleOpenEditExpense = (exp: Expense) => {
    setEditingExpense(exp);
    setPurchaseCardId(exp.creditCardId || '');
    setPurchaseDesc(exp.description);
    setPurchaseAmount(String(Math.abs(exp.amount)));
    setPurchaseDate(parseISO(exp.date));
    setPurchaseCategoryId(exp.categoryId);
    setPurchaseInstallments(String(exp.installments || 1));
    setPurchaseIsRefund(exp.amount < 0);
    setPurchaseOpen(true);
  };

  // Return the actual transaction date — the invoice period logic in
  // getInvoicePeriod / getCardExpensesForMonth already handles which
  // invoice month a purchase falls into based on the card's closingDay.
  const getInvoiceDate = (txDate: Date, _cardId: string) => {
    return format(txDate, 'yyyy-MM-dd');
  };

  const handleSavePurchase = async () => {
    if (!purchaseDesc || !purchaseAmount || (!purchaseIsRefund && !purchaseCategoryId)) return;
    const rawAmount = Number(purchaseAmount);
    const finalAmount = purchaseIsRefund ? -Math.abs(rawAmount) : Math.abs(rawAmount);

    // Editing existing expense
    if (editingExpense) {
      await onUpdateExpense({
        ...editingExpense,
        description: purchaseDesc,
        amount: finalAmount,
        date: format(purchaseDate, 'yyyy-MM-dd'),
        categoryId: purchaseIsRefund ? refundCategoryId : purchaseCategoryId,
      });
      toast.success('Lançamento atualizado!');
      setPurchaseOpen(false);
      setEditingExpense(null);
      return;
    }

    if (purchaseIsRefund) {
      const invoiceDate = getInvoiceDate(purchaseDate, purchaseCardId);
      await onAddExpense({
        categoryId: refundCategoryId,
        description: purchaseDesc,
        amount: finalAmount,
        date: invoiceDate,
        isFixed: false,
        creditCardId: purchaseCardId,
        status: 'paid',
      });
      toast.success('Estorno registrado!');
    } else {
      const numInstallments = Math.max(1, Number(purchaseInstallments));
      const installmentAmount = Math.round((rawAmount / numInstallments) * 100) / 100;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < numInstallments; i++) {
        const installDate = addMonths(purchaseDate, i);
        const invoiceDate = getInvoiceDate(installDate, purchaseCardId);
        await onAddExpense({
          categoryId: purchaseCategoryId,
          description: numInstallments > 1 ? `${purchaseDesc} (${i + 1}/${numInstallments})` : purchaseDesc,
          amount: installmentAmount,
          date: invoiceDate,
          isFixed: false,
          creditCardId: purchaseCardId,
          installments: numInstallments > 1 ? numInstallments : undefined,
          currentInstallment: numInstallments > 1 ? i + 1 : undefined,
          status: new Date(invoiceDate) > today ? 'pending' : 'paid',
        });
      }
      toast.success(numInstallments > 1
        ? `Compra adicionada em ${numInstallments}x de ${formatCurrency(installmentAmount)}`
        : 'Compra adicionada!');
    }
    setPurchaseOpen(false);
  };

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
    if (exp.installments && exp.installments > 1) {
      setDeleteTarget(exp);
      setDeleteConfirmOpen(true);
    } else {
      onDeleteExpense(exp.id);
    }
  };

  const handleDeleteConfirm = (deleteAll: boolean) => {
    if (!deleteTarget) return;
    if (deleteAll) {
      const related = findRelatedInstallments(deleteTarget);
      onDeleteExpense(deleteTarget.id);
      related.forEach(e => onDeleteExpense(e.id));
      toast.success(`${related.length + 1} parcelas excluídas`);
    } else {
      onDeleteExpense(deleteTarget.id);
      toast.success('Parcela excluída');
    }
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

  // ---- Computed ----
  // Invoice period: from closingDay+1 of previous month to closingDay of current month
  const getInvoicePeriod = (cardId: string, month: Date) => {
    const card = cards.find(c => c.id === cardId);
    const closing = card ? card.closingDay : 31;
    const prevMonth = subMonths(month, 1);
    // Start: day after closing of previous month
    const start = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), closing + 1);
    // End: closing day of current month
    const end = new Date(month.getFullYear(), month.getMonth(), closing, 23, 59, 59, 999);
    return { start, end };
  };

  const getCardExpensesForMonth = (cardId: string, month: Date) => {
    const { start, end } = getInvoicePeriod(cardId, month);
    return expenses
      .filter(e => {
        if (e.creditCardId !== cardId) return false;
        const d = parseISO(e.date);
        return d >= start && d <= end;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  const getCardSpentForMonth = (cardId: string, month: Date) => {
    return getCardExpensesForMonth(cardId, month).reduce((sum, e) => sum + e.amount, 0);
  };

  // Calculate carried-over balance from previous months
  // Accumulates unpaid debt AND net credits from previous invoices
  const getCarriedBalance = (cardId: string, month: Date) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return 0;

    const today = new Date();
    const prevMonth = subMonths(month, 1);
    const prevDueDate = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), Math.min(card.dueDay, 28));

    // Only carry over if past the previous month's due date
    if (today < prevDueDate) return 0;

    let carried = 0;

    // Walk backwards through previous invoice periods accumulating balances
    for (let i = 0; i < 24; i++) {
      const m = subMonths(month, i + 1);
      const periodExpenses = getCardExpensesForMonth(cardId, m);
      if (periodExpenses.length === 0 && i > 0) break;

      const periodNet = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
      const allPaid = periodExpenses.length > 0 && periodExpenses.every(e => e.status === 'paid');

      if (allPaid) {
        // Invoice was settled. If net was negative (credit), the credit carries forward.
        // If net was positive, the user paid it — nothing carries.
        if (periodNet < 0) {
          carried += periodNet; // negative = credit carries forward
        }
      } else {
        // Invoice not fully settled — unpaid items carry forward
        const unpaidTotal = periodExpenses
          .filter(e => e.status !== 'paid')
          .reduce((sum, e) => sum + e.amount, 0);
        carried += unpaidTotal;
      }
    }

    return carried; // positive = debt, negative = credit
  };

  const getCardTotalForMonth = (cardId: string, month: Date) => {
    const currentMonthTotal = getCardSpentForMonth(cardId, month);
    const carried = getCarriedBalance(cardId, month);
    return currentMonthTotal + carried;
  };

  // Get all unpaid expenses for a card up to and including the given month's invoice period
  const getAllUnpaidForInvoice = (cardId: string, month: Date) => {
    const { end } = getInvoicePeriod(cardId, month);
    return expenses
      .filter(e => e.creditCardId === cardId && e.status !== 'paid' && parseISO(e.date) <= end)
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  // Liquidar fatura total
  const handlePayFullInvoice = (cardId: string, month: Date) => {
    const unpaid = getAllUnpaidForInvoice(cardId, month);
    if (unpaid.length === 0) { toast.info('Fatura já está paga!'); return; }
    unpaid.forEach(exp => {
      onUpdateExpense({ ...exp, status: 'paid' });
    });
    toast.success('Fatura liquidada por completo!');
  };

  // Pagamento parcial - marks expenses as paid until amount is covered
  const handlePartialPayment = (cardId: string, month: Date) => {
    const payValue = Number(partialPayAmount);
    if (!payValue || payValue <= 0) { toast.error('Informe um valor válido.'); return; }

    const allUnpaid = getAllUnpaidForInvoice(cardId, month)
      .filter(e => e.amount > 0); // only positive (debts)

    let remaining = payValue;
    let paidCount = 0;
    for (const exp of allUnpaid) {
      if (remaining <= 0) break;
      if (exp.amount <= remaining) {
        onUpdateExpense({ ...exp, status: 'paid' });
        remaining -= exp.amount;
        paidCount++;
      } else {
        break; // Can't partially pay a single expense
      }
    }
    const paid = payValue - remaining;
    toast.success(`${formatCurrency(paid)} pagos (${paidCount} lançamentos). Saldo restante: ${formatCurrency(remaining > 0 ? remaining : 0)}`);
    setPartialPayOpen(null);
    setPartialPayAmount('');
  };

  const monthLabel = format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR });
  const nextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));
  const prevMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const swipeHandlers = useSwipe({ onSwipeLeft: nextMonth, onSwipeRight: prevMonth });

  const importSelectedCount = importTransactions.filter(t => t.selected).length;
  const importDuplicateCount = importTransactions.filter(t => t.isDuplicate).length;
  const importSelectedTotal = importTransactions.filter(t => t.selected).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-4" {...swipeHandlers}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-display font-bold">Cartões de Crédito</h2>
        <div className="flex items-center gap-2">
          {/* Import Button */}
          {cards.length > 0 && (
            <Dialog open={importOpen} onOpenChange={(v) => v ? setImportOpen(true) : handleImportClose()}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Upload className="w-4 h-4" /> Importar Fatura
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="font-display flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    {importStep === 'select' && 'Importar Fatura de Cartão'}
                    {importStep === 'review' && 'Revisar Lançamentos'}
                    {importStep === 'done' && 'Importação Concluída'}
                  </DialogTitle>
                </DialogHeader>

                {importStep === 'select' && (
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Selecione o Cartão</Label>
                      <Select value={importCardId} onValueChange={setImportCardId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha um cartão..." />
                        </SelectTrigger>
                        <SelectContent>
                          {cards.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="flex items-center gap-2">
                                <CreditCardIcon className="w-4 h-4" />
                                {c.name} •••• {c.lastDigits}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {importCardId && (
                      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center space-y-3 hover:border-primary/50 transition-colors">
                        <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                        <div>
                          <p className="font-medium">Selecione o arquivo da fatura</p>
                          <p className="text-sm text-muted-foreground">Formatos aceitos: CSV, OFX, QFX</p>
                        </div>
                        <input
                          ref={importFileRef}
                          type="file"
                          accept=".csv,.ofx,.qfx"
                          onChange={handleImportFileSelect}
                          className="hidden"
                          id="card-statement-file"
                        />
                        <Button
                          variant="outline"
                          onClick={() => importFileRef.current?.click()}
                          disabled={importLoading}
                          className="gap-2"
                        >
                          {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                          {importLoading ? 'Processando...' : 'Escolher Arquivo'}
                        </Button>
                      </div>
                    )}

                    <Card className="p-4 space-y-2 bg-muted/50">
                      <h4 className="font-medium text-sm">💡 Dicas</h4>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• Exporte a fatura do seu cartão no formato CSV ou OFX</li>
                        <li>• Parcelas (ex: 1/10) são detectadas e lançadas nos meses seguintes</li>
                        <li>• Você pode editar descrição, valor, data e parcelas antes de importar</li>
                        <li>• Duplicatas são detectadas automaticamente</li>
                      </ul>
                    </Card>
                  </div>
                )}

                {importStep === 'review' && (
                  <div className="flex flex-col flex-1 min-h-0 space-y-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button variant="ghost" size="sm" className="text-xs px-2 h-8" onClick={() => setImportTransactions(prev => prev.map(t => ({ ...t, selected: true })))}>Selecionar todos</Button>
                        <Button variant="ghost" size="sm" className="text-xs px-2 h-8" onClick={() => setImportTransactions(prev => prev.map(t => ({ ...t, selected: false })))}>Limpar</Button>
                        <Button variant="outline" size="sm" className="gap-1 text-xs px-2.5 h-8" onClick={handleImportAICategorize} disabled={importCategorizing}>
                          {importCategorizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          {importCategorizing ? 'Categorizando...' : 'Categorizar IA'}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {importSelectedCount} selecionados
                        {importDuplicateCount > 0 && <span className="text-warning"> · {importDuplicateCount} duplicata(s)</span>}
                        {' '}· Total: <span className={cn("font-medium", importSelectedTotal < 0 ? "text-success" : "text-destructive")}>{formatCurrency(importSelectedTotal)}</span>
                      </p>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1">
                      {importTransactions.map((t, idx) => {
                        const updateField = (field: string, value: any) => setImportTransactions(prev => prev.map((tr, i) => i === idx ? { ...tr, [field]: value } : tr));
                        return (
                        <Card key={idx} className={cn("p-3 flex items-start gap-3 transition-all", !t.selected && "opacity-50", t.isDuplicate && "border-warning/50 bg-warning/5")}>
                          <Checkbox checked={t.selected} onCheckedChange={() => updateField('selected', !t.selected)} className="mt-1" />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            {t.isDuplicate && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">
                                <Copy className="w-3 h-3" /> Duplicata
                              </span>
                            )}
                            <div className="flex items-center gap-2">
                              <Input
                                value={t.description}
                                onChange={e => updateField('description', e.target.value)}
                                className="h-7 text-sm flex-1"
                              />
                              <Input
                                type="number"
                                value={t.amount}
                                onChange={e => updateField('amount', parseFloat(e.target.value) || 0)}
                                className={cn("h-7 text-sm w-24 text-right", t.amount < 0 && "text-success")}
                                step="0.01"
                              />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Input
                                type="date"
                                value={t.date}
                                onChange={e => updateField('date', e.target.value)}
                                className="h-7 text-xs w-[140px]"
                              />
                              {t.installments && t.currentInstallment && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                  <Repeat className="w-3 h-3" /> {t.currentInstallment}/{t.installments} — gera {t.installments - t.currentInstallment + 1} parcelas
                                </span>
                              )}
                              {!t.installments && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] px-1.5 gap-1"
                                  onClick={() => {
                                    updateField('installments', 2);
                                    updateField('currentInstallment', 1);
                                  }}
                                >
                                  <Repeat className="w-3 h-3" /> Parcelar
                                </Button>
                              )}
                              {t.installments && (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={t.currentInstallment || 1}
                                    onChange={e => updateField('currentInstallment', Math.max(1, parseInt(e.target.value) || 1))}
                                    className="h-6 text-xs w-12 text-center"
                                    min={1}
                                    max={t.installments}
                                  />
                                  <span className="text-xs text-muted-foreground">/</span>
                                  <Input
                                    type="number"
                                    value={t.installments}
                                    onChange={e => {
                                      const v = Math.max(2, parseInt(e.target.value) || 2);
                                      updateField('installments', v);
                                      if ((t.currentInstallment || 1) > v) updateField('currentInstallment', v);
                                    }}
                                    className="h-6 text-xs w-12 text-center"
                                    min={2}
                                  />
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => { updateField('installments', undefined); updateField('currentInstallment', undefined); }}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                              <Select value={t.categoryId || ''} onValueChange={(v) => updateField('categoryId', v)}>
                                <SelectTrigger className="h-7 text-xs w-[160px]">
                                  <SelectValue placeholder="Categoria" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(t.amount < 0 ? incomeCategories : expenseCategories).map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </Card>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Button variant="outline" onClick={() => { setImportStep('select'); setImportTransactions([]); }} className="gap-2">
                        <ArrowLeft className="w-4 h-4" /> Voltar
                      </Button>
                      <Button onClick={handleImportConfirm} disabled={importingData || importSelectedCount === 0} className="flex-1 gap-2">
                        {importingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        {importingData ? 'Importando...' : `Importar ${importSelectedCount} lançamentos`}
                      </Button>
                    </div>
                  </div>
                )}

                {importStep === 'done' && (
                  <div className="py-8 text-center space-y-4">
                    <CheckCircle2 className="w-16 h-16 mx-auto text-success" />
                    <div>
                      <p className="text-lg font-medium">Importação concluída!</p>
                      <p className="text-sm text-muted-foreground">Os lançamentos foram adicionados à fatura do cartão.</p>
                    </div>
                    <Button onClick={handleImportClose}>Fechar</Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">{editing ? 'Editar' : 'Novo'} Cartão</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Nome do Cartão</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Nubank" />
                </div>
                <div>
                  <Label>Últimos 4 dígitos</Label>
                  <Input value={lastDigits} onChange={e => setLastDigits(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" maxLength={4} />
                </div>
                <div>
                  <Label>Limite (R$)</Label>
                  <Input type="number" value={limit} onChange={e => setLimit(e.target.value)} placeholder="5000" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Dia de Fechamento</Label>
                    <Input type="number" value={closingDay} onChange={e => setClosingDay(e.target.value)} min={1} max={31} />
                  </div>
                  <div>
                    <Label>Dia de Vencimento</Label>
                    <Input type="number" value={dueDay} onChange={e => setDueDay(e.target.value)} min={1} max={31} />
                  </div>
                </div>
                <div>
                  <Label>Cor</Label>
                  <div className="flex gap-2 mt-1">
                    {CARD_COLORS.map(c => (
                      <button
                        key={c}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setColor(c)}
                      />
                    ))}
                  </div>
                </div>
                {accounts.length > 0 && (
                  <div>
                    <Label>Conta vinculada</Label>
                    <Select value={cardAccountId} onValueChange={setCardAccountId}>
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
                {editing && (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive mt-2 gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteCardConfirmOpen(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4" /> Excluir Cartão
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-center gap-4">
        <Button size="icon" variant="ghost" onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="text-sm font-medium capitalize min-w-[180px] text-center">{monthLabel}</span>
        <Button size="icon" variant="ghost" onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {cards.length === 0 && (
        <Card className="glass-card p-8 text-center text-muted-foreground">
          Nenhum cartão cadastrado. Clique em "Novo Cartão" para começar.
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(card => {
          const currentSpent = getCardSpentForMonth(card.id, selectedMonth);
          const carried = getCarriedBalance(card.id, selectedMonth);
          const totalInvoice = currentSpent + carried;
          // Total unpaid across ALL months for limit usage
          const totalUnpaid = expenses
            .filter(e => e.creditCardId === card.id && e.status !== 'paid')
            .reduce((sum, e) => sum + e.amount, 0);
          const available = card.limit - totalUnpaid;
          const usagePercent = card.limit > 0 ? Math.min(Math.max((totalUnpaid / card.limit) * 100, 0), 100) : 0;
          const monthExpenses = getCardExpensesForMonth(card.id, selectedMonth);

          return (
            <Card key={card.id} className="glass-card overflow-hidden cursor-pointer transition-colors" onClick={() => handleOpenEdit(card)}>
              {/* Card visual */}
              <div
                className="p-5 text-white relative overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}dd)` }}
              >
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 -translate-y-8 translate-x-8" style={{ backgroundColor: 'white' }} />
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm opacity-80">Cartão de Crédito</p>
                    <p className="text-lg font-bold font-display mt-1">{card.name}</p>
                  </div>
                  <CreditCardIcon className="w-8 h-8 opacity-60" />
                </div>
                <p className="text-lg tracking-widest mt-4 font-mono">•••• •••• •••• {card.lastDigits}</p>
                <div className="flex justify-between mt-4 text-sm">
                  <div>
                    <p className="opacity-70">Fecha dia</p>
                    <p className="font-semibold">{card.closingDay}</p>
                  </div>
                  <div>
                    <p className="opacity-70">Vence dia</p>
                    <p className="font-semibold">{card.dueDay}</p>
                  </div>
                  <div className="text-right">
                    <p className="opacity-70">Limite</p>
                    <p className="font-semibold">{formatCurrency(card.limit)}</p>
                  </div>
                </div>
              </div>

              {/* Usage bar */}
              <div className="p-4 space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Uso do limite</span>
                    <span className={cn("font-semibold", totalUnpaid < 0 && "text-success")}>{formatCurrency(totalUnpaid)}</span>
                  </div>
                  {carried !== 0 && (
                    <p className={cn("text-xs mb-1", carried > 0 ? "text-destructive" : "text-success")}>
                      {carried > 0 ? 'Saldo anterior: +' : 'Crédito anterior: '}{formatCurrency(carried)}
                    </p>
                  )}
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${usagePercent}%`,
                        backgroundColor: usagePercent > 80 ? 'hsl(0, 72%, 51%)' : card.color,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Disponível: {formatCurrency(Math.max(0, available))}</span>
                    <span>{Math.round(usagePercent)}% usado</span>
                  </div>
                </div>

                {/* Invoice total */}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground font-medium">Fatura do mês</p>
                    <span className={cn("text-lg font-bold font-display", totalInvoice < 0 ? "text-success" : totalInvoice > 0 ? "text-destructive" : "text-muted-foreground")}>
                      {formatCurrency(totalInvoice)}
                    </span>
                  </div>

                  {/* Payment actions */}
                  {(() => {
                    const pendingExpenses = monthExpenses.filter(e => e.status !== 'paid' && e.amount > 0);
                    const pendingAmount = pendingExpenses.reduce((s, e) => s + e.amount, 0);
                    const allPaidInvoice = monthExpenses.length > 0 && pendingAmount <= 0;

                    if (allPaidInvoice) {
                      return (
                        <div className="flex items-center justify-between mb-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-success" />
                            <span className="text-xs font-medium text-success">Pagamento realizado</span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              monthExpenses.forEach(exp => {
                                if (exp.status === 'paid') {
                                  onUpdateExpense({ ...exp, status: 'pending' });
                                }
                              });
                              toast.success('Fatura reaberta');
                            }}
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Reabrir fatura
                          </Button>
                        </div>
                      );
                    }

                    if (pendingAmount <= 0) return null;

                    return (
                      <div className="flex gap-2 mb-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="flex-1 gap-1.5 text-xs bg-success hover:bg-success/90 text-success-foreground"
                          onClick={(e) => { e.stopPropagation(); handlePayFullInvoice(card.id, selectedMonth); }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Liquidar Total
                        </Button>
                        {partialPayOpen === card.id ? (
                          <div className="flex-1 flex gap-1" onClick={e => e.stopPropagation()}>
                            <Input
                              type="number"
                              placeholder="Valor"
                              value={partialPayAmount}
                              onChange={e => setPartialPayAmount(e.target.value)}
                              className="h-8 text-xs"
                              step="0.01"
                            />
                            <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => handlePartialPayment(card.id, selectedMonth)}>
                              Pagar
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs"
                            onClick={(e) => { e.stopPropagation(); setPartialPayOpen(card.id); setPartialPayAmount(''); }}
                          >
                            Pagamento Parcial
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Month expenses list */}
                {monthExpenses.length > 0 ? (
                  <div className="border-t pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted-foreground">Despesas da fatura</p>
                    </div>
                    {monthExpenses.map(exp => (
                      <div
                        key={exp.id}
                        className="flex items-center text-sm py-1.5 border-b border-border/50 last:border-0 group/item cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleOpenEditExpense(exp); }}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="break-words whitespace-normal block">{exp.description}</span>
                          {exp.installments && exp.currentInstallment && (
                            <span className="text-xs text-muted-foreground">
                              Parcela {exp.currentInstallment}/{exp.installments}
                            </span>
                          )}
                        </div>
                        <span className="text-muted-foreground text-xs mx-2 shrink-0">
                          {format(parseISO(exp.date), 'dd/MM')}
                        </span>
                        <span className={cn("font-medium shrink-0", exp.amount < 0 && "text-success")}>{formatCurrency(exp.amount)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 ml-1 sm:opacity-0 sm:group-hover/item:opacity-100 transition-opacity text-destructive shrink-0"
                          onClick={(e) => { e.stopPropagation(); handleDeleteExpense(exp); }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground text-center py-2">Nenhuma despesa neste mês</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={(e) => { e.stopPropagation(); handleOpenPurchase(card.id); }}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" /> Nova Compra
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 text-success hover:text-success"
                    onClick={(e) => { e.stopPropagation(); handleOpenPurchase(card.id, true); }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Estorno
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Purchase Dialog */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {purchaseIsRefund ? <RotateCcw className="w-5 h-5 text-success" /> : <ShoppingCart className="w-5 h-5" />}
              {editingExpense ? 'Editar Lançamento' : purchaseIsRefund ? 'Estorno no Cartão' : 'Nova Compra no Cartão'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Descrição</Label>
              <Input value={purchaseDesc} onChange={e => setPurchaseDesc(e.target.value)} placeholder={purchaseIsRefund ? "Ex: Estorno compra duplicada" : "Ex: Loja de eletrônicos"} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={purchaseCategoryId} onValueChange={setPurchaseCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(purchaseIsRefund ? incomeCategories : expenseCategories).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{purchaseIsRefund ? 'Valor do estorno (R$)' : 'Valor total (R$)'}</Label>
              <Input type="number" value={purchaseAmount} onChange={e => setPurchaseAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>{purchaseIsRefund ? 'Data do estorno' : 'Data da compra'}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(purchaseDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={purchaseDate} onSelect={(d) => d && setPurchaseDate(d)} locale={ptBR} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            {!editingExpense && !purchaseIsRefund && (
              <div>
                <Label>Parcelas</Label>
                <Input type="number" value={purchaseInstallments} onChange={e => setPurchaseInstallments(e.target.value)} min={1} max={48} />
                {Number(purchaseInstallments) > 1 && purchaseAmount && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {purchaseInstallments}x de {formatCurrency(Math.round((Number(purchaseAmount) / Number(purchaseInstallments)) * 100) / 100)}
                  </p>
                )}
              </div>
            )}
            <Button onClick={handleSavePurchase} className={cn("w-full", purchaseIsRefund && !editingExpense && "bg-success hover:bg-success/90")} disabled={!purchaseDesc || !purchaseAmount || (!purchaseIsRefund && !purchaseCategoryId)}>
              {editingExpense ? 'Salvar Alterações' : purchaseIsRefund ? 'Registrar Estorno' : Number(purchaseInstallments) > 1 ? `Adicionar em ${purchaseInstallments}x` : 'Adicionar Compra'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Delete card double confirmation */}
      <AlertDialog open={deleteCardConfirmOpen} onOpenChange={(v) => { setDeleteCardConfirmOpen(v); if (!v) setDeleteCardStep(1); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteCardStep === 1 ? 'Excluir cartão?' : 'Tem certeza absoluta?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCardStep === 1
                ? `O cartão "${editing?.name}" e todos os seus lançamentos serão excluídos permanentemente.`
                : 'Esta ação não pode ser desfeita. Todos os lançamentos vinculados a este cartão serão removidos.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteCardStep(1)}>Cancelar</AlertDialogCancel>
            {deleteCardStep === 1 ? (
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); setDeleteCardStep(2); }}>
                Sim, excluir
              </AlertDialogAction>
            ) : (
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
                if (editing) {
                  onDeleteCard(editing.id);
                  setOpen(false);
                  setEditing(null);
                  setDeleteCardConfirmOpen(false);
                  setDeleteCardStep(1);
                  toast.success('Cartão excluído!');
                }
              }}>
                Confirmar exclusão
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageFAB
        newLabel="Novo Cartão"
        newIcon={<CreditCardIcon className="w-5 h-5 text-primary" />}
        onNew={handleOpenNew}
        showVoice={false}
      />
    </div>
  );
}

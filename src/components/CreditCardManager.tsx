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
import { Trash2, CreditCard as CreditCardIcon, ChevronLeft, ChevronRight, Upload, FileText, Loader2, ArrowLeft, ArrowRight, CheckCircle2, Copy, Pencil, Repeat, CalendarIcon, ShoppingCart, RotateCcw, Wand2, ImagePlus, X } from 'lucide-react';
import { PageFAB } from '@/components/PageFAB';
import { format, parseISO, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { calculateCreditCardMonthlyBalance, getCreditCardInvoicePeriod } from '@/lib/creditCardBalance';

interface ParsedCardTransaction {
  date: string;
  invoiceMonth: string;
  description: string;
  originalDescription: string;
  amount: number;
  categoryId?: string;
  selected: boolean;
  isDuplicate: boolean;
  installments?: number;
  currentInstallment?: number;
  ofxIdentifier?: string;
  duplicateHash: string;
  warnings: string[];
}

interface StatementTransaction {
  date: string;
  description: string;
  originalDescription?: string;
  amount: number;
  type?: 'income' | 'expense';
}

function detectInstallments(description: string): { installments?: number; currentInstallment?: number; cleanDescription: string } {
  // Match patterns like "1/10", "01/12", "PARC 3/10", "PARCELA 3 DE 10", "P03/12".
  const patterns = [
    /\b(?:parc(?:ela)?|prest(?:acao)?|p)\s*\.?\s*(\d{1,3})\s*(?:\/|de|-)\s*(\d{1,3})\b/i,
    /\b(\d{1,3})\s*(?:\/|de|-)\s*(\d{1,3})\s*(?:parc(?:ela)?|prest(?:acao)?)\b/i,
    /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/i,
  ];
  const match = patterns.map(pattern => description.match(pattern)).find(Boolean);
  if (match) {
    const current = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);
    if (total >= 2 && total <= 999 && current >= 1 && current <= total) {
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

function normalizeImportText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getRenameRuleKey(description: string) {
  return normalizeImportText(description)
    .replace(/\b(?:parc(?:ela)?|prest(?:acao)?|p)\s*\.?\s*\d{1,3}\s*(?:\/|de|-)\s*\d{1,3}\b/gi, ' ')
    .replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\b(?:br|brasil|sao paulo|sp|rio de janeiro|rj)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(value: string) {
  const keepUpper = new Set(['ifood', 'uber', 'amazon', 'netflix', 'spotify', 'pix']);
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(word => keepUpper.has(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function summarizeCardDescription(originalDescription: string) {
  const { cleanDescription } = detectInstallments(originalDescription);
  const cleaned = cleanDescription
    .replace(/\b(?:compra|compras|cartao|cartao credito|credito|debito|pagamento|pgto)\b/gi, ' ')
    .replace(/\b(?:aut|auth|cod|codigo|terminal|nsu)\s*[:.#-]?\s*\d+\b/gi, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\b(?:br|brasil|sao paulo|sp|rio de janeiro|rj)\b/gi, ' ')
    .replace(/[*/_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return toTitleCase(cleaned || originalDescription.trim());
}

function getInvoicePostingDate(invoiceMonth: string) {
  return `${invoiceMonth}-01`;
}

function makeDuplicateHash(cardId: string, date: string, originalDescription: string, amount: number) {
  return `${cardId}|${date}|${normalizeImportText(originalDescription)}|${amount.toFixed(2)}`;
}

function formatInstallmentLabel(current: number, total: number) {
  const width = Math.max(2, String(total).length);
  return `${String(current).padStart(width, '0')}/${String(total).padStart(width, '0')}`;
}

function getInstallmentDescription(description: string, current: number, total: number) {
  return total > 1 ? `${description} ${formatInstallmentLabel(current, total)}` : description;
}

function makeInstallmentGroupId(cardId: string, purchaseDate: string, originalDescription: string, total: number, amount: number) {
  return `installment|${cardId}|${purchaseDate}|${normalizeImportText(originalDescription)}|${total}|${amount.toFixed(2)}`;
}

function getInstallmentAmount(totalAmount: number, totalInstallments: number, installmentNumber: number) {
  const baseCents = Math.floor((Math.abs(totalAmount) * 100) / totalInstallments);
  const totalCents = Math.round(Math.abs(totalAmount) * 100);
  const cents = installmentNumber === totalInstallments
    ? totalCents - (baseCents * (totalInstallments - 1))
    : baseCents;

  return (totalAmount < 0 ? -cents : cents) / 100;
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

const MAX_CARD_COVER_IMAGE_SIZE = 1024 * 1024;
const CARD_COVER_WIDTH = 960;
const CARD_COVER_HEIGHT = 605;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Nao foi possivel carregar a imagem.'));
    image.src = src;
  });
}

async function resizeCardCoverImage(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Nao foi possivel carregar a imagem.'));
    };
    reader.onerror = () => reject(new Error('Nao foi possivel carregar a imagem.'));
    reader.readAsDataURL(file);
  });

  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_COVER_WIDTH;
  canvas.height = CARD_COVER_HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Nao foi possivel ajustar a imagem.');

  const sourceRatio = image.width / image.height;
  const coverRatio = CARD_COVER_WIDTH / CARD_COVER_HEIGHT;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (sourceRatio > coverRatio) {
    sourceWidth = image.height * coverRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / coverRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    CARD_COVER_WIDTH,
    CARD_COVER_HEIGHT,
  );

  return canvas.toDataURL('image/jpeg', 0.86);
}

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
  const [cardCoverImageUrl, setCardCoverImageUrl] = useState('');
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
  const [importEnriching, setImportEnriching] = useState(false);
  const [importTransactions, setImportTransactions] = useState<ParsedCardTransaction[]>([]);
  const [importStep, setImportStep] = useState<'select' | 'review' | 'done'>('select');
  const [importingData, setImportingData] = useState(false);
  const [importReferenceMonth, setImportReferenceMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [importFileName, setImportFileName] = useState('');
  const [importCloseConfirmOpen, setImportCloseConfirmOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const expenseCategories = categories.filter(c => c.type === 'expense');
  const incomeCategories = categories.filter(c => c.type === 'income');
  const defaultCategoryId = expenseCategories[0]?.id || '';
  const refundCategoryId = categories.find(c => c.type === 'income' && c.name.trim().toLowerCase() === 'estornos')?.id || defaultCategoryId;
  const getStoredRenameRules = () => {
    try {
      return JSON.parse(localStorage.getItem('credit-card-rename-rules') || '{}') as Record<string, string>;
    } catch {
      return {};
    }
  };

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
    setCardCoverImageUrl(card.coverImageUrl || '');
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
    setCardCoverImageUrl('');
    setOpen(true);
  };

  const handleCardCoverSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_CARD_COVER_IMAGE_SIZE) {
      toast.error('Imagem muito grande. Use uma imagem de ate 1MB.');
      event.target.value = '';
      return;
    }

    try {
      const resizedImage = await resizeCardCoverImage(file);
      setCardCoverImageUrl(resizedImage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel ajustar a imagem.');
    } finally {
      event.target.value = '';
    }
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
      coverImageUrl: cardCoverImageUrl || undefined,
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
    if (!['ofx', 'qfx'].includes(ext || '')) {
      toast.error('Formato nao suportado. Use OFX ou QFX.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Limite de 5MB.');
      return;
    }

    setImportFileName(file.name);
    setImportLoading(true);
    try {
      const content = await file.text();
      const fileFormat = 'ofx';

      const { data, error } = await supabase.functions.invoke('parse-statement', {
        body: { content, format: fileFormat },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); setImportLoading(false); return; }

      const existingKeys = new Set(
        expenses
          .filter(ex => ex.creditCardId === importCardId)
          .map(ex => ex.duplicateHash || makeDuplicateHash(
            importCardId,
            ex.purchaseDate || ex.date,
            ex.originalDescription || ex.description,
            ex.amount,
          ))
      );
      const renameRules = getStoredRenameRules();

      // Transactions from a card statement: negative = expense, positive = refund/credit
      const parsed: ParsedCardTransaction[] = ((data.transactions || []) as StatementTransaction[]).map((t) => {
        const isRefund = t.type === 'income'; // positive amounts from OFX are credits/refunds
        const amt = isRefund ? -Math.abs(t.amount) : Math.abs(t.amount); // refunds stored as negative
        const originalDescription = t.originalDescription || t.description;
        const { installments, currentInstallment, cleanDescription } = detectInstallments(originalDescription);
        const ruleKey = getRenameRuleKey(originalDescription);
        const summaryDescription = renameRules[ruleKey] || summarizeCardDescription(cleanDescription);
        const duplicateHash = makeDuplicateHash(importCardId, t.date, originalDescription, amt);
        const isDuplicate = existingKeys.has(duplicateHash);
        const warnings: string[] = [];
        if (installments && currentInstallment && currentInstallment > installments) {
          warnings.push('Parcela atual maior que o total de parcelas.');
        }
        if (installments && currentInstallment && currentInstallment > 1) {
          warnings.push('Parcela intermediaria: confira se a fatura importada e o mes de competencia estao corretos.');
        }
        return {
          date: t.date,
          invoiceMonth: importReferenceMonth,
          description: summaryDescription,
          originalDescription,
          amount: amt,
          categoryId: isRefund ? refundCategoryId : defaultCategoryId,
          selected: !isDuplicate,
          isDuplicate,
          installments: isRefund ? undefined : installments,
          currentInstallment: isRefund ? undefined : currentInstallment,
          ofxIdentifier: duplicateHash,
          duplicateHash,
          warnings,
        };
      });

      const dupeCount = parsed.filter(t => t.isDuplicate).length;
      setImportTransactions(parsed);
      setImportStep('review');
      toast.success(`${parsed.length} lançamentos encontrados!${dupeCount > 0 ? ` ${dupeCount} duplicata(s).` : ''}`);

      // Automatically enrich descriptions and categorize via OpenRouter
      setImportEnriching(true);
      try {
        const { data: enrichData, error: enrichError } = await supabase.functions.invoke('enrich-descriptions', {
          body: {
            transactions: parsed.map(t => ({
              description: t.description,
              originalDescription: t.originalDescription,
              amount: Math.abs(t.amount),
              type: t.amount < 0 ? 'income' : 'expense',
            })),
            categories: categories.map(c => ({ id: c.id, name: c.name, type: c.type })),
          },
        });

        if (!enrichError && !enrichData?.error && enrichData?.enrichments) {
          const enrichments: { index: number; cleanDescription: string; categoryId?: string }[] = enrichData.enrichments;
          setImportTransactions(prev => {
            const updated = [...prev];
            for (const e of enrichments) {
              if (e.index >= 0 && e.index < updated.length) {
                // Don't override refund category
                const isRefund = updated[e.index].amount < 0;
                updated[e.index] = {
                  ...updated[e.index],
                  ...(e.cleanDescription ? { description: e.cleanDescription } : {}),
                  ...(!isRefund && e.categoryId ? { categoryId: e.categoryId } : {}),
                };
              }
            }
            return updated;
          });
        }
      } catch (enrichErr) {
        console.warn('Card enrichment skipped:', enrichErr);
      } finally {
        setImportEnriching(false);
      }
    } catch (err) {
      console.error('Card import error:', err);
      toast.error('Erro ao processar arquivo.');
    } finally {
      setImportLoading(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleReviewedImportConfirm = async () => {
    const selected = importTransactions.filter(t => t.selected);
    if (selected.length === 0) { toast.error('Selecione ao menos um lancamento.'); return; }

    setImportingData(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let totalCreated = 0;
      const renameRules = getStoredRenameRules();
      const plannedDuplicateHashes = new Set(expenses.map(exp => exp.duplicateHash).filter(Boolean));

      for (const t of selected) {
        const isRefund = t.amount < 0;
        const totalInstallments = isRefund ? 1 : Math.max(1, t.installments || 1);
        const firstInstallment = isRefund ? 1 : Math.min(totalInstallments, Math.max(1, t.currentInstallment || 1));
        const totalPurchaseAmount = totalInstallments > 1 ? Math.abs(t.amount) * totalInstallments : Math.abs(t.amount);
        const signedTotalPurchaseAmount = t.amount < 0 ? -totalPurchaseAmount : totalPurchaseAmount;
        const groupId = totalInstallments > 1
          ? makeInstallmentGroupId(importCardId, t.date, t.originalDescription, totalInstallments, signedTotalPurchaseAmount)
          : undefined;
        const ruleKey = getRenameRuleKey(t.originalDescription);

        if (ruleKey && t.description && t.description !== summarizeCardDescription(t.originalDescription)) {
          renameRules[ruleKey] = t.description;
        }

        for (let installmentNumber = firstInstallment; installmentNumber <= totalInstallments; installmentNumber++) {
          const offset = installmentNumber - firstInstallment;
          const invoiceMonth = format(addMonths(parseISO(getInvoicePostingDate(t.invoiceMonth)), offset), 'yyyy-MM');
          const invoiceDate = getInvoicePostingDate(invoiceMonth);
          const txDate = new Date(invoiceDate);
          const amount = totalInstallments > 1
            ? getInstallmentAmount(signedTotalPurchaseAmount, totalInstallments, installmentNumber)
            : t.amount;
          const duplicateHash = totalInstallments > 1
            ? `${groupId}|${installmentNumber}`
            : makeDuplicateHash(importCardId, t.date, t.originalDescription, amount);

          if (plannedDuplicateHashes.has(duplicateHash)) {
            continue;
          }
          plannedDuplicateHashes.add(duplicateHash);

          await onAddExpense({
            categoryId: t.categoryId || defaultCategoryId,
            description: getInstallmentDescription(t.description, installmentNumber, totalInstallments),
            originalDescription: t.originalDescription,
            amount,
            date: invoiceDate,
            purchaseDate: t.date,
            invoiceMonth,
            isFixed: false,
            creditCardId: importCardId,
            installments: totalInstallments,
            currentInstallment: installmentNumber,
            installmentGroupId: groupId,
            status: isRefund ? 'paid' : (txDate > today ? 'pending' : 'paid'),
            ofxIdentifier: totalInstallments > 1 ? `${groupId}|${installmentNumber}` : t.ofxIdentifier || duplicateHash,
            duplicateHash,
          });
          totalCreated++;
          await new Promise(r => setTimeout(r, 30));
        }
      }

      localStorage.setItem('credit-card-rename-rules', JSON.stringify(renameRules));
      toast.success(`${totalCreated} lancamentos importados!`);
      setImportStep('done');
    } catch {
      toast.error('Erro ao importar.');
    } finally {
      setImportingData(false);
    }
  };

  const resetImportState = () => {
    setImportStep('select');
    setImportTransactions([]);
    setImportCardId('');
    setImportFileName('');
    setImportLoading(false);
    setImportEnriching(false);
    setImportingData(false);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const hasUnconfirmedImportData = importStep !== 'done' && importTransactions.length > 0;

  const handleImportClose = () => {
    if (hasUnconfirmedImportData) {
      setImportCloseConfirmOpen(true);
      return;
    }

    setImportOpen(false);
    setImportCloseConfirmOpen(false);
    setTimeout(resetImportState, 150);
  };

  const confirmImportClose = () => {
    setImportOpen(false);
    setImportCloseConfirmOpen(false);
    setTimeout(resetImportState, 150);
  };

  const handleOpenPurchase = (cardId: string, isRefund = false) => {
    setEditingExpense(null);
    setPurchaseCardId(cardId);
    setPurchaseDesc('');
    setPurchaseAmount('');
    setPurchaseDate(new Date());
    setPurchaseCategoryId(isRefund ? refundCategoryId : defaultCategoryId);
    setPurchaseInstallments('1');
    setPurchaseIsRefund(isRefund);
    setPurchaseOpen(true);
  };

  const handleOpenEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setPurchaseCardId(expense.creditCardId || '');
    setPurchaseDesc(expense.description);
    setPurchaseAmount(String(Math.abs(expense.amount)));
    setPurchaseDate(parseISO(expense.purchaseDate || expense.date));
    setPurchaseCategoryId(expense.categoryId);
    setPurchaseInstallments(String(expense.installments || 1));
    setPurchaseIsRefund(expense.amount < 0);
    setPurchaseOpen(true);
  };

  const getInvoiceDate = (txDate: Date, _cardId: string) => {
    return format(txDate, 'yyyy-MM-dd');
  };

  const resetPurchaseForm = () => {
    setPurchaseOpen(false);
    setEditingExpense(null);
    setPurchaseDesc('');
    setPurchaseAmount('');
    setPurchaseCategoryId('');
    setPurchaseInstallments('1');
    setPurchaseIsRefund(false);
  };

  const handleSavePurchase = async () => {
    const amountValue = Number(purchaseAmount);
    if (!purchaseDesc || !amountValue || (!purchaseIsRefund && !purchaseCategoryId)) return;

    const signedAmount = purchaseIsRefund ? -Math.abs(amountValue) : Math.abs(amountValue);

    if (editingExpense) {
      const invoiceDate = getInvoiceDate(purchaseDate, purchaseCardId);
      onUpdateExpense({
        ...editingExpense,
        categoryId: purchaseCategoryId || editingExpense.categoryId,
        description: purchaseDesc,
        amount: signedAmount,
        date: invoiceDate,
        purchaseDate: format(purchaseDate, 'yyyy-MM-dd'),
        invoiceMonth: invoiceDate.substring(0, 7),
        installments: purchaseIsRefund ? undefined : editingExpense.installments,
        currentInstallment: purchaseIsRefund ? undefined : editingExpense.currentInstallment,
      });
      toast.success('Lancamento atualizado!');
      resetPurchaseForm();
      return;
    }

    const installments = Math.min(999, Math.max(1, Number(purchaseInstallments) || 1));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (purchaseIsRefund || installments === 1) {
      const invoiceDate = getInvoiceDate(purchaseDate, purchaseCardId);
      const duplicateHash = makeDuplicateHash(purchaseCardId, format(purchaseDate, 'yyyy-MM-dd'), purchaseDesc, signedAmount);
      await onAddExpense({
        categoryId: purchaseCategoryId || defaultCategoryId,
        description: purchaseDesc,
        originalDescription: purchaseDesc,
        amount: signedAmount,
        date: invoiceDate,
        purchaseDate: format(purchaseDate, 'yyyy-MM-dd'),
        invoiceMonth: invoiceDate.substring(0, 7),
        isFixed: false,
        creditCardId: purchaseCardId,
        installments: 1,
        currentInstallment: 1,
        status: purchaseIsRefund ? 'paid' : (new Date(invoiceDate) > today ? 'pending' : 'paid'),
        duplicateHash,
      });
      toast.success(purchaseIsRefund ? 'Estorno registrado!' : 'Compra adicionada!');
      resetPurchaseForm();
      return;
    }

    const purchaseDateKey = format(purchaseDate, 'yyyy-MM-dd');
    const groupId = makeInstallmentGroupId(purchaseCardId, purchaseDateKey, purchaseDesc, installments, amountValue);
    for (let i = 0; i < installments; i++) {
      const installmentNumber = i + 1;
      const installmentDate = addMonths(purchaseDate, i);
      const invoiceDate = getInvoiceDate(installmentDate, purchaseCardId);
      const amount = getInstallmentAmount(amountValue, installments, installmentNumber);
      const duplicateHash = `${groupId}|${installmentNumber}`;
      await onAddExpense({
        categoryId: purchaseCategoryId || defaultCategoryId,
        description: getInstallmentDescription(purchaseDesc, installmentNumber, installments),
        originalDescription: purchaseDesc,
        amount,
        date: invoiceDate,
        purchaseDate: purchaseDateKey,
        invoiceMonth: invoiceDate.substring(0, 7),
        isFixed: false,
        creditCardId: purchaseCardId,
        installments,
        currentInstallment: installmentNumber,
        installmentGroupId: groupId,
        status: new Date(invoiceDate) > today ? 'pending' : 'paid',
        ofxIdentifier: duplicateHash,
        duplicateHash,
      });
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    toast.success(`Compra adicionada em ${installments} parcelas!`);
    resetPurchaseForm();
  };

  const handleDeleteExpense = (expense: Expense) => {
    if (expense.installments && expense.installments > 1) {
      setDeleteTarget(expense);
      setDeleteConfirmOpen(true);
      return;
    }

    onDeleteExpense(expense.id);
    toast.success('Lancamento excluido!');
  };

  const handleDeleteConfirm = (deleteAll: boolean) => {
    if (!deleteTarget) return;

    if (deleteAll && deleteTarget.installmentGroupId) {
      expenses
        .filter(expense => expense.installmentGroupId === deleteTarget.installmentGroupId)
        .forEach(expense => onDeleteExpense(expense.id));
      toast.success('Parcelas excluidas!');
    } else if (deleteAll && deleteTarget.creditCardId && deleteTarget.installments) {
      expenses
        .filter(expense =>
          expense.creditCardId === deleteTarget.creditCardId &&
          expense.description === deleteTarget.description &&
          expense.installments === deleteTarget.installments
        )
        .forEach(expense => onDeleteExpense(expense.id));
      toast.success('Parcelas excluidas!');
    } else {
      onDeleteExpense(deleteTarget.id);
      toast.success('Parcela excluida!');
    }

    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

  const getInvoicePeriod = (cardId: string, month: Date) => {
    const card = cards.find(c => c.id === cardId);
    return getCreditCardInvoicePeriod({ closingDay: card ? card.closingDay : 31 }, month);
  };

  const getCardBalanceSummary = (cardId: string, month: Date) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) {
      return {
        openingBalance: 0,
        monthlyActivity: 0,
        closingBalance: 0,
        expenses: [],
        period: getCreditCardInvoicePeriod({ closingDay: 31 }, month),
      };
    }

    return calculateCreditCardMonthlyBalance(card, expenses, month);
  };

  const getCardExpensesForMonth = (cardId: string, month: Date) => {
    return getCardBalanceSummary(cardId, month).expenses;
  };

  const getCardSpentForMonth = (cardId: string, month: Date) => {
    return getCardBalanceSummary(cardId, month).monthlyActivity;
  };

  const getCardTotalForMonth = (cardId: string, month: Date) => {
    return getCardBalanceSummary(cardId, month).closingBalance;
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
              <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[88vh] overflow-hidden flex flex-col p-5 sm:p-6">
                <DialogHeader>
                  <DialogTitle className="font-display flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    {importStep === 'select' && 'Importar Fatura de Cartão'}
                    {importStep === 'review' && 'Revisar Lançamentos'}
                    {importStep === 'done' && 'Importação Concluída'}
                  </DialogTitle>
                </DialogHeader>

                {importStep === 'select' && (
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pt-2 pr-1">
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

                    <div>
                      <Label>Mes de competencia da fatura</Label>
                      <Input
                        type="month"
                        value={importReferenceMonth}
                        onChange={e => setImportReferenceMonth(e.target.value)}
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 space-y-1.5 opacity-100">
                      <h4 className="font-medium text-sm">Dicas</h4>
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        <li>• Importe apenas arquivos .ofx.</li>
                        <li>• Confira o mês de referência antes de confirmar.</li>
                        <li>• Revise parcelas como 01/10, 02/10 etc.</li>
                        <li>• Verifique possíveis lançamentos duplicados.</li>
                        <li>• O saldo positivo ou negativo será transferido para o próximo mês.</li>
                      </ul>
                    </div>

                    {importCardId && (
                      <div className="border-2 border-dashed border-border rounded-xl px-5 py-6 text-center space-y-3 hover:border-primary/50 transition-colors">
                        <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                        <div>
                          <p className="font-medium">Selecione o arquivo da fatura</p>
                          <p className="text-sm text-muted-foreground">Formatos aceitos: OFX, QFX</p>
                        </div>
                        <input
                          ref={importFileRef}
                          type="file"
                          accept=".ofx,.qfx"
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
                  </div>
                )}

                {importStep === 'review' && (
                  <div className="flex flex-col flex-1 min-h-0 space-y-3">
                    <div className="flex flex-col gap-2">
                      {importEnriching && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                          <Wand2 className="w-3.5 h-3.5 animate-pulse text-primary" />
                          <span>Identificando empresas e categorizando automaticamente...</span>
                        </div>
                      )}
                      <Card className="p-3 space-y-1.5 bg-muted/50 border border-border opacity-100">
                        <h4 className="font-medium text-sm">Dicas</h4>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          <li>• Confira o mês de referência e revise possíveis duplicidades antes de confirmar.</li>
                          <li>• Ajuste parcelas como 01/10, 02/10 e valores com até 3 dígitos.</li>
                        </ul>
                      </Card>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Arquivo</p>
                          <p className="font-medium truncate">{importFileName || '-'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Cartao</p>
                          <p className="font-medium truncate">{cards.find(c => c.id === importCardId)?.name || '-'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Competencia</p>
                          <Input
                            type="month"
                            value={importReferenceMonth}
                            onChange={e => {
                              setImportReferenceMonth(e.target.value);
                              setImportTransactions(prev => prev.map(t => ({ ...t, invoiceMonth: e.target.value })));
                            }}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button variant="ghost" size="sm" className="text-xs px-2 h-8" onClick={() => setImportTransactions(prev => prev.map(t => ({ ...t, selected: true })))}>Selecionar todos</Button>
                        <Button variant="ghost" size="sm" className="text-xs px-2 h-8" onClick={() => setImportTransactions(prev => prev.map(t => ({ ...t, selected: false })))}>Limpar</Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {importSelectedCount} selecionados
                        {importDuplicateCount > 0 && <span className="text-warning"> · {importDuplicateCount} duplicata(s)</span>}
                        {' '}· Total: <span className={cn("font-medium", importSelectedTotal < 0 ? "text-success" : "text-destructive")}>{formatCurrency(importSelectedTotal)}</span>
                      </p>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1">
                      {importTransactions.map((t, idx) => {
                        const updateField = <K extends keyof ParsedCardTransaction>(field: K, value: ParsedCardTransaction[K]) => {
                          setImportTransactions(prev => prev.map((tr, i) => i === idx ? { ...tr, [field]: value } : tr));
                        };
                        return (
                        <Card key={idx} className={cn("p-3 flex items-start gap-3 transition-all", !t.selected && "opacity-50", t.isDuplicate && "border-warning/50 bg-warning/5")}>
                          <Checkbox checked={t.selected} onCheckedChange={() => updateField('selected', !t.selected)} className="mt-1" />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            {t.isDuplicate && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">
                                <Copy className="w-3 h-3" /> Duplicata
                              </span>
                            )}
                            {t.warnings.map((warning) => (
                              <span key={warning} className="inline-flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">
                                {warning}
                              </span>
                            ))}
                            <p className="text-[10px] text-muted-foreground break-words">
                              Original: {t.originalDescription}
                            </p>
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
                              <Input
                                type="month"
                                value={t.invoiceMonth}
                                onChange={e => updateField('invoiceMonth', e.target.value)}
                                className="h-7 text-xs w-[130px]"
                              />
                              {t.installments && t.currentInstallment && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                  <Repeat className="w-3 h-3" /> Parcela {t.currentInstallment}/{t.installments}
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
                                    onChange={e => updateField('currentInstallment', Math.min(999, Math.max(1, parseInt(e.target.value) || 1)))}
                                    className="h-8 text-xs min-w-[80px] w-20 text-center"
                                    min={1}
                                    max={999}
                                  />
                                  <span className="text-xs text-muted-foreground">/</span>
                                  <Input
                                    type="number"
                                    value={t.installments}
                                    onChange={e => {
                                      const v = Math.min(999, Math.max(2, parseInt(e.target.value) || 2));
                                      updateField('installments', v);
                                      if ((t.currentInstallment || 1) > v) updateField('currentInstallment', v);
                                    }}
                                    className="h-8 text-xs min-w-[80px] w-20 text-center"
                                    min={2}
                                    max={999}
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
                      <Button onClick={handleReviewedImportConfirm} disabled={importingData || importEnriching || importSelectedCount === 0} className="flex-1 gap-2">
                        {importingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        {importingData ? 'Importando...' : importEnriching ? 'Aguarde a IA...' : `Importar ${importSelectedCount} lançamentos`}
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

          <AlertDialog open={importCloseConfirmOpen} onOpenChange={setImportCloseConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sair da importação?</AlertDialogTitle>
                <AlertDialogDescription>
                  Deseja sair da importação? Os dados não confirmados serão perdidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={confirmImportClose}
                >
                  Sair e descartar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogContent aria-describedby={undefined}>
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
                <div>
                  <Label>Capa do cartao</Label>
                  <div className="mt-2 space-y-2">
                    {cardCoverImageUrl && (
                      <div className="relative aspect-[1.586/1] overflow-hidden rounded-md border border-border">
                        <img src={cardCoverImageUrl} alt="Capa do cartao" className="h-full w-full object-cover" />
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="absolute right-2 top-2 h-8 w-8"
                          onClick={() => setCardCoverImageUrl('')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    <div>
                      <Input id="card-cover-image" type="file" accept="image/*" onChange={handleCardCoverSelect} className="hidden" />
                      <Button type="button" variant="outline" className="w-full gap-2" asChild>
                        <label htmlFor="card-cover-image" className="cursor-pointer">
                          <ImagePlus className="h-4 w-4" />
                          {cardCoverImageUrl ? 'Trocar imagem' : 'Anexar imagem'}
                        </label>
                      </Button>
                    </div>
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
          const balanceSummary = getCardBalanceSummary(card.id, selectedMonth);
          const currentSpent = balanceSummary.monthlyActivity;
          const carried = balanceSummary.openingBalance;
          const totalInvoice = balanceSummary.closingBalance;
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
                className="relative aspect-[1.586/1] overflow-hidden p-5 text-white"
                style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}dd)` }}
              >
                {card.coverImageUrl ? (
                  <>
                    <img src={card.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/40" />
                  </>
                ) : (
                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 -translate-y-8 translate-x-8" style={{ backgroundColor: 'white' }} />
                )}
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <p className="text-sm opacity-80">Cartão de Crédito</p>
                    <p className="text-lg font-bold font-display mt-1">{card.name}</p>
                  </div>
                  <CreditCardIcon className="w-8 h-8 opacity-60" />
                </div>
                <p className="relative z-10 text-lg tracking-widest mt-4 font-mono">•••• •••• •••• {card.lastDigits}</p>
                <div className="relative z-10 flex justify-between mt-4 text-sm">
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
                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Saldo inicial</p>
                      <p className={cn("font-semibold", carried < 0 ? "text-success" : carried > 0 ? "text-destructive" : "text-muted-foreground")}>
                        {formatCurrency(carried)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground">Lançamentos</p>
                      <p className={cn("font-semibold", currentSpent < 0 ? "text-success" : currentSpent > 0 ? "text-destructive" : "text-muted-foreground")}>
                        {formatCurrency(currentSpent)}
                      </p>
                    </div>
                  </div>
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
        <DialogContent aria-describedby={undefined}>
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
                <Input type="number" value={purchaseInstallments} onChange={e => setPurchaseInstallments(e.target.value)} min={1} max={999} />
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




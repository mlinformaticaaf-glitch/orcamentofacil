import { useState, useRef } from 'react';
import { Category, Expense, Income } from '@/types/budget';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, ArrowRight, ArrowLeft, Sparkles, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'expense' | 'income';
  categoryId?: string;
  selected: boolean;
  isDuplicate: boolean;
}

interface Props {
  categories: Category[];
  expenses: Expense[];
  incomes: Income[];
  onAddExpense: (exp: Omit<Expense, 'id'>) => void;
  onAddIncome: (inc: Omit<Income, 'id'>) => void;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function StatementImport({ categories, expenses, incomes, onAddExpense, onAddIncome }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const expenseCategories = categories.filter(c => c.type === 'expense');
  const incomeCategories = categories.filter(c => c.type === 'income');
  const defaultCategoryId = expenseCategories[0]?.id || '';
  const defaultIncomeCategoryId = incomeCategories.find(c => c.name.trim().toLowerCase() === 'estornos')?.id || incomeCategories[0]?.id || '';

  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

  const existingKeys = new Set([
    ...expenses.map(e => `${e.date}|${normalize(e.description)}|${e.amount}`),
    ...incomes.map(i => `${i.date}|${normalize(i.description)}|${i.amount}`),
  ]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setLoading(true);

    try {
      const content = await file.text();
      const fileFormat = ext === 'csv' ? 'csv' : 'ofx';

      const { data, error } = await supabase.functions.invoke('parse-statement', {
        body: { content, format: fileFormat },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        setLoading(false);
        return;
      }

      const parsed: ParsedTransaction[] = (data.transactions || []).map((t: any) => {
        const key = `${t.date}|${normalize(t.description)}|${t.amount}`;
        const isDuplicate = existingKeys.has(key);
        return {
          ...t,
          categoryId: t.type === 'expense' ? defaultCategoryId : defaultIncomeCategoryId,
          selected: !isDuplicate,
          isDuplicate,
        };
      });

      const dupeCount = parsed.filter(t => t.isDuplicate).length;

      setTransactions(parsed);
      setStep('review');
      toast.success(`${parsed.length} transações encontradas!${dupeCount > 0 ? ` ${dupeCount} duplicata(s) detectada(s).` : ''}`);
    } catch (err: any) {
      console.error('Import error:', err);
      toast.error('Erro ao processar arquivo. Verifique o formato.');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleAll = (selected: boolean) => {
    setTransactions(prev => prev.map(t => ({ ...t, selected })));
  };

  const toggleOne = (idx: number) => {
    setTransactions(prev => prev.map((t, i) => i === idx ? { ...t, selected: !t.selected } : t));
  };

  const setCategoryForItem = (idx: number, categoryId: string) => {
    setTransactions(prev => prev.map((t, i) => i === idx ? { ...t, categoryId } : t));
  };

  const setTypeForItem = (idx: number, type: 'expense' | 'income') => {
    setTransactions(prev => prev.map((t, i) => i === idx ? { ...t, type, categoryId: type === 'expense' ? defaultCategoryId : defaultIncomeCategoryId } : t));
  };

  const handleAICategorize = async () => {
    if (categories.length === 0) {
      toast.error('Crie categorias antes de usar a categorização automática.');
      return;
    }

    setCategorizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('categorize-transactions', {
        body: {
          transactions: transactions.map(t => ({
            description: t.description,
            amount: t.amount,
            type: t.type,
          })),
          categories: categories.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
          })),
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      const categorizations: { index: number; categoryId: string }[] = data.categorizations || [];
      
      setTransactions(prev => {
        const updated = [...prev];
        for (const cat of categorizations) {
          if (cat.index >= 0 && cat.index < updated.length) {
            updated[cat.index] = { ...updated[cat.index], categoryId: cat.categoryId };
          }
        }
        return updated;
      });

      toast.success(`${categorizations.length} transações categorizadas automaticamente!`);
    } catch (err: any) {
      console.error('AI categorize error:', err);
      toast.error('Erro ao categorizar. Tente novamente.');
    } finally {
      setCategorizing(false);
    }
  };

  const handleImport = async () => {
    const selected = transactions.filter(t => t.selected);
    if (selected.length === 0) {
      toast.error('Selecione ao menos uma transação.');
      return;
    }

    setImporting(true);

    try {
      for (const t of selected) {
        if (t.type === 'expense') {
          onAddExpense({
            categoryId: t.categoryId || defaultCategoryId,
            description: t.description,
            amount: t.amount,
            date: t.date,
            isFixed: false,
            status: 'paid',
          });
        } else {
          onAddIncome({
            description: t.description,
            amount: t.amount,
            date: t.date,
            isRecurring: false,
            status: 'received',
            categoryId: t.categoryId,
          });
        }
        // Small delay to avoid overwhelming
        await new Promise(r => setTimeout(r, 50));
      }

      toast.success(`${selected.length} transações importadas com sucesso!`);
      setStep('done');
    } catch (err) {
      console.error('Import error:', err);
      toast.error('Erro ao importar transações.');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setStep('upload');
      setTransactions([]);
    }, 300);
  };

  const selectedCount = transactions.filter(t => t.selected).length;
  const duplicateCount = transactions.filter(t => t.isDuplicate).length;
  const selectedTotal = transactions.filter(t => t.selected).reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => v ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="w-4 h-4" /> Importar Extrato
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {step === 'upload' && 'Importar Extrato Bancário'}
            {step === 'review' && 'Revisar Transações'}
            {step === 'done' && 'Importação Concluída'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center space-y-3 hover:border-primary/50 transition-colors">
              <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
              <div>
                <p className="font-medium">Selecione um arquivo de extrato</p>
                <p className="text-sm text-muted-foreground">Formatos aceitos: CSV, OFX, QFX</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.ofx,.qfx"
                onChange={handleFileSelect}
                className="hidden"
                id="statement-file"
              />
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {loading ? 'Processando...' : 'Escolher Arquivo'}
              </Button>
            </div>

            <Card className="p-4 space-y-2 bg-muted/50">
              <h4 className="font-medium text-sm">💡 Dicas</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Exporte o extrato do seu banco no formato CSV ou OFX</li>
                <li>• CSV: precisa ter colunas de Data, Descrição e Valor</li>
                <li>• OFX/QFX: formato padrão bancário, funciona automaticamente</li>
                <li>• Valores negativos são importados como despesas</li>
                <li>• Valores positivos são importados como receitas</li>
              </ul>
            </Card>
          </div>
        )}

        {step === 'review' && (
          <div className="flex flex-col flex-1 min-h-0 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => toggleAll(true)}>Selecionar todos</Button>
                <Button variant="ghost" size="sm" onClick={() => toggleAll(false)}>Limpar seleção</Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAICategorize} disabled={categorizing}>
                  {categorizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {categorizing ? 'Categorizando...' : 'Categorizar com IA'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedCount} selecionadas
                {duplicateCount > 0 && <span className="text-warning"> · {duplicateCount} duplicata(s)</span>}
                {' '}· Saldo: <span className={cn("font-medium", selectedTotal >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(selectedTotal)}</span>
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1">
              {transactions.map((t, idx) => (
                <Card key={idx} className={cn("p-3 flex items-start gap-3 transition-all", !t.selected && "opacity-50", t.isDuplicate && "border-warning/50 bg-warning/5")}>
                  {t.isDuplicate && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded-full shrink-0 mt-0.5">
                      <Copy className="w-3 h-3" /> Duplicata
                    </span>
                  )}
                  <Checkbox checked={t.selected} onCheckedChange={() => toggleOne(idx)} className="mt-1" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium break-words">{t.description}</p>
                      <p className={cn("text-sm font-semibold shrink-0", t.type === 'income' ? 'text-success' : 'text-destructive')}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">{format(parseISO(t.date), 'dd/MM/yyyy')}</span>
                      <Select value={t.type} onValueChange={(v) => setTypeForItem(idx, v as 'expense' | 'income')}>
                        <SelectTrigger className="h-7 text-xs w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Despesa</SelectItem>
                          <SelectItem value="income">Receita</SelectItem>
                        </SelectContent>
                      </Select>
                      {t.type === 'expense' && (
                        <Select value={t.categoryId || ''} onValueChange={(v) => setCategoryForItem(idx, v)}>
                          <SelectTrigger className="h-7 text-xs w-[160px]">
                            <SelectValue placeholder="Categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {expenseCategories.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {t.type === 'income' && (
                        <Select value={t.categoryId || ''} onValueChange={(v) => setCategoryForItem(idx, v)}>
                          <SelectTrigger className="h-7 text-xs w-[160px]">
                            <SelectValue placeholder="Categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {incomeCategories.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => { setStep('upload'); setTransactions([]); }} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>
              <Button onClick={handleImport} disabled={importing || selectedCount === 0} className="flex-1 gap-2">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {importing ? 'Importando...' : `Importar ${selectedCount} transações`}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="py-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 mx-auto text-success" />
            <div>
              <p className="text-lg font-medium">Importação concluída!</p>
              <p className="text-sm text-muted-foreground">As transações foram adicionadas ao seu orçamento.</p>
            </div>
            <Button onClick={handleClose}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

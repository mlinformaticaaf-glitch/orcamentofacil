import { useState } from 'react';
import { Plus, Receipt, DollarSign, Mic, X, MicOff, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Category, Expense, Income } from '@/types/budget';
import { useVoiceInput } from '@/hooks/useVoiceInput';

interface Props {
  categories: Category[];
  onAddExpense: (exp: Omit<Expense, 'id'>) => void;
  onAddIncome: (inc: Omit<Income, 'id'>) => void;
  onOpenExpenseForm: () => void;
  onOpenIncomeForm: () => void;
}

export function FloatingActionButton({ categories, onAddExpense, onAddIncome, onOpenExpenseForm, onOpenIncomeForm }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  
  const {
    isVoiceOpen,
    setIsVoiceOpen,
    isListening,
    isProcessing,
    transcript,
    parsedTransactions,
    startListening,
    stopListening,
    confirmTransactions,
    resetVoiceState,
  } = useVoiceInput({ categories, onAddExpense, onAddIncome });

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 sm:bottom-6 right-4 sm:right-6 z-30 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Options popup */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-display text-center">Novo Registro</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <Button
              variant="outline"
              className="h-14 justify-start gap-3 text-base"
              onClick={() => { setIsOpen(false); onOpenIncomeForm(); }}
            >
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 text-success" />
              </div>
              <span>Nova Receita</span>
            </Button>
            <Button
              variant="outline"
              className="h-14 justify-start gap-3 text-base"
              onClick={() => { setIsOpen(false); onOpenExpenseForm(); }}
            >
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                <Receipt className="w-5 h-5 text-destructive" />
              </div>
              <span>Nova Despesa</span>
            </Button>
            <Button
              variant="outline"
              className="h-14 justify-start gap-3 text-base"
              onClick={() => { setIsOpen(false); setIsVoiceOpen(true); }}
            >
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Mic className="w-5 h-5 text-accent" />
              </div>
              <span>Registro por Voz</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Voice dialog */}
      <Dialog open={isVoiceOpen} onOpenChange={(open) => { if (!open) resetVoiceState(); setIsVoiceOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Registro por Voz</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Diga o que gastou ou recebeu. Exemplo: <em>"Gastei 50 reais no supermercado e 30 no uber"</em>
            </p>

            {/* Mic button */}
            <div className="flex justify-center">
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={isProcessing}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-destructive text-destructive-foreground animate-pulse scale-110'
                    : 'bg-primary text-primary-foreground hover:scale-105'
                }`}
              >
                {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              {isListening ? 'Ouvindo... Toque para parar' : 'Toque para falar'}
            </p>

            {/* Transcript */}
            {transcript && (
              <div className="bg-muted rounded-xl p-3">
                <p className="text-sm font-medium mb-1">Você disse:</p>
                <p className="text-sm text-muted-foreground italic">"{transcript.trim()}"</p>
              </div>
            )}

            {/* Process button */}
            {isProcessing && (
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Processando com IA...</span>
              </div>
            )}

            {/* Parsed results */}
            {parsedTransactions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Registros identificados:</p>
                {parsedTransactions.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 bg-muted rounded-xl p-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.type === 'income' ? 'bg-success/10' : 'bg-destructive/10'}`}>
                      {t.type === 'income' ? <DollarSign className="w-4 h-4 text-success" /> : <Receipt className="w-4 h-4 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.type === 'expense' ? t.categoryName || 'Sem categoria' : 'Receita'}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold shrink-0 ${t.type === 'income' ? 'text-success' : ''}`}>
                      {formatCurrency(t.amount)}
                    </p>
                  </div>
                ))}
                <Button onClick={confirmTransactions} className="w-full gap-2">
                  <Check className="w-4 h-4" /> Confirmar e Registrar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

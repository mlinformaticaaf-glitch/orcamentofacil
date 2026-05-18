import { useState } from 'react';
import { Plus, Mic, MicOff, Loader2, Check, Receipt, DollarSign } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Category, Expense, Income } from '@/types/budget';
import { useVoiceInput } from '@/hooks/useVoiceInput';

interface PageFABProps {
  /** Label for the "new record" option */
  newLabel: string;
  /** Icon for the "new record" option */
  newIcon: React.ReactNode;
  /** Called when "new record" is clicked */
  onNew: () => void;
  /** Categories for voice processing */
  categories?: Category[];
  /** Called to add expense from voice */
  onAddExpense?: (exp: Omit<Expense, 'id'>) => void;
  /** Called to add income from voice */
  onAddIncome?: (inc: Omit<Income, 'id'>) => void;
  /** Whether to show voice option (default true if categories provided) */
  showVoice?: boolean;
}

export function PageFAB({
  newLabel,
  newIcon,
  onNew,
  categories = [],
  onAddExpense,
  onAddIncome,
  showVoice = true,
}: PageFABProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [confirmAddMoreOpen, setConfirmAddMoreOpen] = useState(false);
  const hasVoice = showVoice && categories.length > 0 && (onAddExpense || onAddIncome);

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
      {/* Circular FAB */}
      <button
        onClick={() => {
          if (hasVoice) {
            setIsMenuOpen(true);
          } else {
            onNew();
          }
        }}
        className="fixed bottom-24 sm:bottom-6 right-4 sm:right-6 z-30 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Menu popup */}
      {hasVoice && (
        <Dialog open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle className="font-display text-center">Novo Registro</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 pt-2">
              <Button
                variant="outline"
                className="h-14 justify-start gap-3 text-base"
                onClick={() => { setIsMenuOpen(false); onNew(); }}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  {newIcon}
                </div>
                <span>{newLabel}</span>
              </Button>
              <Button
                variant="outline"
                className="h-14 justify-start gap-3 text-base"
                onClick={() => { setIsMenuOpen(false); setIsVoiceOpen(true); setTimeout(startListening, 50); }}
              >
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <Mic className="w-5 h-5 text-accent" />
                </div>
                <span>Registro por Voz</span>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

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

            {transcript && (
              <div className="bg-muted rounded-xl p-3">
                <p className="text-sm font-medium mb-1">Você disse:</p>
                <p className="text-sm text-muted-foreground italic">"{transcript.trim()}"</p>
              </div>
            )}

            {isProcessing && (
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Processando com IA...</span>
              </div>
            )}

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
                <Button onClick={() => {
                  const success = confirmTransactions();
                  if (success) {
                    setIsVoiceOpen(false);
                    setConfirmAddMoreOpen(true);
                  }
                }} className="w-full gap-2">
                  <Check className="w-4 h-4" /> Confirmar e Registrar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Add more confirmation */}
      <AlertDialog open={confirmAddMoreOpen} onOpenChange={setConfirmAddMoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrado com sucesso!</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja adicionar mais algum lançamento por voz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmAddMoreOpen(false)}>Não</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setConfirmAddMoreOpen(false);
              setIsVoiceOpen(true);
              setTimeout(startListening, 50);
            }}>
              Sim, adicionar outro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

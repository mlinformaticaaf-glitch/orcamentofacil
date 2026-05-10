import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Category, Expense, Income } from '@/types/budget';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sun, Moon, Monitor, LogOut, Palette, Trash2, Loader2, Upload, MoonStar } from 'lucide-react';
import { toast } from 'sonner';
import { StatementImport } from '@/components/StatementImport';

interface Props {
  onDataCleared?: () => void;
  categories: Category[];
  expenses: Expense[];
  incomes: Income[];
  onAddExpense: (exp: Omit<Expense, 'id'>) => void;
  onAddIncome: (inc: Omit<Income, 'id'>) => void;
}

export function SettingsPage({ onDataCleared, categories, expenses, incomes, onAddExpense, onAddIncome }: Props) {
  const { theme, setTheme } = useTheme();
  const { signOut, user } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClearAll = async () => {
    if (!user) return;
    setClearing(true);
    try {
      const [expRes, incRes, cardRes, accRes] = await Promise.all([
        supabase.from('expenses').delete().eq('user_id', user.id),
        supabase.from('incomes').delete().eq('user_id', user.id),
        supabase.from('credit_cards').delete().eq('user_id', user.id),
        supabase.from('accounts').delete().eq('user_id', user.id),
      ]);

      if (expRes.error) throw expRes.error;
      if (incRes.error) throw incRes.error;
      if (cardRes.error) throw cardRes.error;
      if (accRes.error) throw accRes.error;

      toast.success('Todos os registros foram removidos.');
      setConfirmOpen(false);
      onDataCleared?.();
    } catch (err) {
      console.error('Clear all error:', err);
      toast.error('Erro ao limpar registros. Tente novamente.');
    } finally {
      setClearing(false);
    }
  };

  const themeOptions = [
    { id: 'light', label: 'Claro', icon: Sun },
    { id: 'dark', label: 'AMOLED', icon: Moon },
    { id: 'midnight-blue', label: 'Midnight', icon: MoonStar },
    { id: 'system', label: 'Sistema', icon: Monitor },
  ] as const;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-display font-bold">Configurações</h2>

      {/* User info */}
      <Card className="glass-card p-4">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Conta</Label>
        <p className="mt-1 font-medium truncate">{user?.email}</p>
      </Card>

      {/* Theme */}
      <Card className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-muted-foreground" />
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Aparência</Label>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {themeOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                theme === opt.id
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent bg-muted/50 hover:bg-muted'
              }`}
            >
              <opt.icon className="w-5 h-5" />
              <span className="text-sm font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Import statement */}
      <Card className="glass-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-muted-foreground" />
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Importação</Label>
        </div>
        <p className="text-sm text-muted-foreground">Importe extratos bancários em CSV ou OFX/QFX.</p>
        <StatementImport categories={categories} expenses={expenses} incomes={incomes} onAddExpense={onAddExpense} onAddIncome={onAddIncome} />
      </Card>

      {/* Clear all data */}
      <Card className="glass-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-muted-foreground" />
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Dados</Label>
        </div>
        <p className="text-sm text-muted-foreground">Remove todas as despesas, receitas e cartões de crédito.</p>
        <Button variant="destructive" className="w-full gap-2" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="w-4 h-4" />
          Limpar todos os registros
        </Button>
      </Card>

      {/* Logout */}
      <Card className="glass-card p-4">
        <Button variant="destructive" className="w-full gap-2" onClick={signOut}>
          <LogOut className="w-4 h-4" />
          Sair da conta
        </Button>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Limpar todos os registros?</DialogTitle>
            <DialogDescription>
              Essa ação é irreversível. Todas as despesas, receitas e cartões de crédito serão permanentemente removidos. As categorias serão mantidas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={clearing}>Cancelar</Button>
            <Button variant="destructive" onClick={handleClearAll} disabled={clearing} className="gap-2">
              {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {clearing ? 'Limpando...' : 'Sim, limpar tudo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
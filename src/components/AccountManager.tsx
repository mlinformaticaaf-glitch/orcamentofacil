import { useState } from 'react';
import { Account, AccountType, Expense, Income } from '@/types/budget';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Landmark, Wallet, PiggyBank, Building2, Pencil, Trash2, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  accounts: Account[];
  expenses: Expense[];
  incomes: Income[];
  onAdd: (acc: Omit<Account, 'id'>) => void;
  onUpdate: (acc: Account) => void;
  onDelete: (id: string) => void;
  getBalance: (id: string) => number;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const ACCOUNT_TYPES: { id: AccountType; label: string; icon: React.ElementType }[] = [
  { id: 'checking', label: 'Conta Corrente', icon: Landmark },
  { id: 'savings', label: 'Poupança', icon: PiggyBank },
  { id: 'wallet', label: 'Carteira', icon: Wallet },
  { id: 'other', label: 'Outro', icon: Building2 },
];

const ACCOUNT_COLORS = [
  'hsl(215, 80%, 55%)',
  'hsl(152, 69%, 40%)',
  'hsl(280, 65%, 55%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)',
  'hsl(330, 70%, 50%)',
  'hsl(190, 70%, 45%)',
];

const ACCOUNT_ICONS: { id: string; icon: React.ElementType }[] = [
  { id: 'Landmark', icon: Landmark },
  { id: 'PiggyBank', icon: PiggyBank },
  { id: 'Wallet', icon: Wallet },
  { id: 'Building2', icon: Building2 },
];

function getIconComponent(iconName: string) {
  const found = ACCOUNT_ICONS.find(i => i.id === iconName);
  return found ? found.icon : Landmark;
}

export function AccountManager({ accounts, expenses, incomes, onAdd, onUpdate, onDelete, getBalance }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [icon, setIcon] = useState('Landmark');
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [initialBalance, setInitialBalance] = useState('');

  const handleOpenNew = () => {
    setEditing(null);
    setName('');
    setType('checking');
    setIcon('Landmark');
    setColor(ACCOUNT_COLORS[0]);
    setInitialBalance('');
    setOpen(true);
  };

  const handleOpenEdit = (acc: Account) => {
    setEditing(acc);
    setName(acc.name);
    setType(acc.type);
    setIcon(acc.icon);
    setColor(acc.color);
    setInitialBalance(String(acc.initialBalance));
    setOpen(true);
  };

  const handleSave = () => {
    if (!name) return;
    const data = {
      name,
      type,
      icon,
      color,
      initialBalance: Number(initialBalance) || 0,
    };
    if (editing) {
      onUpdate({ ...data, id: editing.id });
    } else {
      onAdd(data);
    }
    setOpen(false);
    setEditing(null);
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + getBalance(acc.id), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">Contas</h2>
      </div>

      {/* Total balance card */}
      <Card className="glass-card p-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Saldo Total</p>
        <p className={cn(
          "text-2xl font-display font-bold",
          totalBalance >= 0 ? "text-success" : "text-destructive"
        )}>
          {formatCurrency(totalBalance)}
        </p>
      </Card>

      {/* Account list */}
      <div className="space-y-3">
        {accounts.length === 0 && (
          <Card className="glass-card p-8 text-center text-muted-foreground">
            Nenhuma conta cadastrada. Adicione sua primeira conta.
          </Card>
        )}
        {accounts.map(acc => {
          const balance = getBalance(acc.id);
          const Icon = getIconComponent(acc.icon);
          const typeLabel = ACCOUNT_TYPES.find(t => t.id === acc.type)?.label || acc.type;

          // Compute entries/exits for this account
          const totalIn = incomes
            .filter(i => i.accountId === acc.id && i.status === 'received')
            .reduce((s, i) => s + i.amount, 0);
          const totalOut = expenses
            .filter(e => e.accountId === acc.id && e.status === 'paid')
            .reduce((s, e) => s + e.amount, 0);

          return (
            <Card key={acc.id} className="glass-card p-4 cursor-pointer group transition-colors hover:bg-muted/30" onClick={() => handleOpenEdit(acc)}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: acc.color + '20' }}>
                  <Icon className="w-5 h-5" style={{ color: acc.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium break-words whitespace-normal">{acc.name}</p>
                  <p className="text-xs text-muted-foreground">{typeLabel}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn("font-semibold font-display", balance >= 0 ? "text-success" : "text-destructive")}>
                    {formatCurrency(balance)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Saldo atual</p>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-success" />
                  <span>Entradas: {formatCurrency(totalIn)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-destructive" />
                  <span>Saídas: {formatCurrency(totalOut)}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* FAB */}
      <div className="fixed bottom-24 sm:bottom-8 right-4 sm:right-8 z-30">
        <Button size="lg" className="rounded-full shadow-lg gap-2 h-12 px-5" onClick={handleOpenNew}>
          <Plus className="w-5 h-5" />
          Nova Conta
        </Button>
      </div>

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Editar' : 'Nova'} Conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Banco do Brasil" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={v => setType(v as AccountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Saldo Inicial (R$)</Label>
              <Input type="number" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Ícone</Label>
              <div className="flex gap-2 mt-1">
                {ACCOUNT_ICONS.map(i => {
                  const IconComp = i.icon;
                  return (
                    <button
                      key={i.id}
                      onClick={() => setIcon(i.id)}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all",
                        icon === i.id ? "border-primary bg-primary/10" : "border-transparent bg-muted/50 hover:bg-muted"
                      )}
                    >
                      <IconComp className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 mt-1">
                {ACCOUNT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn("w-8 h-8 rounded-full border-2 transition-all", color === c ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1">Salvar</Button>
              {editing && (
                <Button variant="destructive" size="icon" onClick={() => { onDelete(editing.id); setOpen(false); setEditing(null); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

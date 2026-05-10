import { useState } from 'react';
import { Category, CategoryType } from '@/types/budget';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Target, ArrowDownCircle, ArrowUpCircle, Tags } from 'lucide-react';
import { PageFAB } from '@/components/PageFAB';

interface Props {
  categories: Category[];
  onAdd: (cat: Omit<Category, 'id'>) => void;
  onUpdate: (cat: Category) => void;
  onDelete: (id: string) => void;
}

const COLORS = [
  'hsl(152, 69%, 40%)', 'hsl(215, 80%, 55%)', 'hsl(280, 65%, 55%)',
  'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(190, 70%, 45%)',
  'hsl(330, 65%, 50%)', 'hsl(120, 50%, 40%)',
];

const ICONS = ['UtensilsCrossed', 'Car', 'Gamepad2', 'Home', 'Heart', 'ShoppingBag', 'GraduationCap', 'Briefcase'];

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function CategoryManager({ categories, onAdd, onUpdate, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [type, setType] = useState<CategoryType>('expense');
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const handleOpen = (cat?: Category) => {
    if (cat) {
      setEditing(cat);
      setName(cat.name);
      setGoal(String(cat.monthlyGoal));
      setColor(cat.color);
      setType(cat.type);
    } else {
      setEditing(null);
      setName('');
      setGoal('');
      setColor(COLORS[categories.length % COLORS.length]);
      setType('expense');
    }
    setOpen(true);
  };

  const handleSave = () => {
    if (!name) return;
    const icon = ICONS[categories.length % ICONS.length];
    if (editing) {
      onUpdate({ ...editing, name, monthlyGoal: Number(goal) || 0, color, type });
    } else {
      onAdd({ name, monthlyGoal: Number(goal) || 0, color, icon, type });
    }
    setOpen(false);
  };

  const incomeCategories = categories.filter(c => c.type === 'income');
  const expenseCategories = categories.filter(c => c.type !== 'income');

  const renderCategory = (cat: Category) => (
    <Card key={cat.id} className="glass-card p-4 group cursor-pointer hover:bg-accent/50 active:scale-[0.99] transition-all" onClick={() => handleOpen(cat)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: cat.color + '20' }}>
          <Target className="w-5 h-5" style={{ color: cat.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold break-words whitespace-normal">{cat.name}</p>
            {cat.type === 'income' ? (
              <ArrowUpCircle className="w-4 h-4 text-success shrink-0" />
            ) : (
              <ArrowDownCircle className="w-4 h-4 text-destructive shrink-0" />
            )}
          </div>
          {cat.monthlyGoal > 0 && <p className="text-sm text-muted-foreground">Meta: {formatCurrency(cat.monthlyGoal)}</p>}
        </div>
        <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleOpen(cat); }}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(cat); }}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">Categorias</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{editing ? 'Editar' : 'Nova'} Categoria</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Alimentação" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as CategoryType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">
                      <span className="flex items-center gap-2"><ArrowDownCircle className="w-4 h-4 text-destructive" /> Despesa</span>
                    </SelectItem>
                    <SelectItem value="income">
                      <span className="flex items-center gap-2"><ArrowUpCircle className="w-4 h-4 text-success" /> Receita</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Meta Mensal (R$)</Label>
                <Input type="number" value={goal} onChange={e => setGoal(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>Cor</Label>
                <div className="flex gap-2 mt-1">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
              <Button onClick={(e) => { e.stopPropagation(); handleSave(); }} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6">
        {expenseCategories.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <ArrowDownCircle className="w-4 h-4 text-destructive" /> Despesas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {expenseCategories.map(renderCategory)}
            </div>
          </div>
        )}

        {incomeCategories.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <ArrowUpCircle className="w-4 h-4 text-success" /> Receitas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {incomeCategories.map(renderCategory)}
            </div>
          </div>
        )}

        {categories.length === 0 && (
          <div className="text-center py-10 text-muted-foreground border border-dashed rounded-xl border-border/50 bg-accent/20">
            Nenhuma categoria cadastrada.
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span> e todas as despesas associadas serão permanentemente excluídas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) { onDelete(deleteTarget.id); setDeleteTarget(null); } }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageFAB
        newLabel="Nova Categoria"
        newIcon={<Tags className="w-5 h-5 text-primary" />}
        onNew={() => handleOpen()}
        showVoice={false}
      />
    </div>
  );
}

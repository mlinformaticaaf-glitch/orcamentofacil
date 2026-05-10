import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface CategorySpend {
  name: string;
  spent: number;
  monthlyGoal: number;
  color: string;
}

interface MonthlyTotal {
  month: string;
  total: number;
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function BudgetPot({ name, spent, monthlyGoal, color }: CategorySpend) {
  const percentage = monthlyGoal > 0 ? Math.min((spent / monthlyGoal) * 100, 100) : 0;
  const overBudget = spent > monthlyGoal;
  const fillColor = overBudget ? 'hsl(0, 72%, 51%)' : color;
  const overflowPercent = overBudget ? Math.min(((spent - monthlyGoal) / monthlyGoal) * 100, 30) : 0;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Pot container */}
      <div className="relative w-20 flex flex-col items-center">
        {/* Pot lid */}
        <div
          className="w-16 h-3 rounded-t-lg border-2 border-b-0 z-10"
          style={{ borderColor: fillColor, backgroundColor: fillColor + '30' }}
        />
        {/* Pot body */}
        <div
          className="relative w-20 h-28 rounded-b-2xl border-2 overflow-hidden"
          style={{ borderColor: fillColor + '60' }}
        >
          {/* Fill level */}
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-700 ease-out"
            style={{
              height: `${percentage}%`,
              background: `linear-gradient(to top, ${fillColor}, ${fillColor}cc)`,
            }}
          >
            {/* Bubbles */}
            {percentage > 20 && (
              <>
                <div
                  className="absolute w-2 h-2 rounded-full opacity-30 animate-pulse"
                  style={{ backgroundColor: 'white', bottom: '30%', left: '25%' }}
                />
                <div
                  className="absolute w-1.5 h-1.5 rounded-full opacity-20 animate-pulse"
                  style={{ backgroundColor: 'white', bottom: '55%', left: '60%', animationDelay: '0.5s' }}
                />
              </>
            )}
          </div>
          {/* Overflow indicator */}
          {overBudget && (
            <div
              className="absolute -top-1 left-0 right-0 animate-pulse"
              style={{ height: `${overflowPercent}%` }}
            >
              <div className="w-full h-full flex justify-center">
                <div
                  className="w-6 h-3 rounded-full opacity-60"
                  style={{ backgroundColor: fillColor }}
                />
              </div>
            </div>
          )}
          {/* Goal line */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed opacity-50"
            style={{ bottom: '100%', transform: 'translateY(100%)', borderColor: 'hsl(var(--foreground))' }}
          />
        </div>
      </div>
      {/* Label */}
      <div className="text-center">
        <p className="text-xs font-semibold truncate max-w-20">{name}</p>
        <p className="text-[10px] text-muted-foreground">{formatCurrency(spent)}</p>
        <p className="text-[10px] text-muted-foreground">de {formatCurrency(monthlyGoal)}</p>
        <span
          className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{
            color: overBudget ? 'hsl(0, 72%, 51%)' : color,
            backgroundColor: overBudget ? 'hsl(0, 72%, 51%, 0.1)' : color + '15',
          }}
        >
          {Math.round((spent / monthlyGoal) * 100)}%
        </span>
      </div>
    </div>
  );
}

export function BudgetBarChart({ data }: { data: CategorySpend[] }) {
  const withGoal = data.filter(d => d.monthlyGoal > 0);

  if (withGoal.length === 0) return null;

  return (
    <Card className="glass-card p-4 sm:p-5">
      <h3 className="font-display font-semibold text-base sm:text-lg mb-4 sm:mb-6">Potes de Gastos por Categoria</h3>
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
        {withGoal.map((d) => (
          <BudgetPot key={d.name} {...d} />
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 mt-4 sm:mt-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-success" />
          <span>Dentro da meta</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-destructive" />
          <span>Acima da meta</span>
        </div>
      </div>
    </Card>
  );
}

export function SpendingLineChart({ data }: { data: MonthlyTotal[] }) {
  return (
    <Card className="glass-card p-4 sm:p-5">
      <h3 className="font-display font-semibold text-base sm:text-lg mb-3 sm:mb-4">Evolução de Gastos (6 meses)</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} width={55} />
          <Tooltip formatter={(value: number) => formatCurrency(value)} />
          <Line
            type="monotone"
            dataKey="total"
            stroke="hsl(160, 84%, 30%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(160, 84%, 30%)', r: 4 }}
            activeDot={{ r: 6 }}
            name="Total"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

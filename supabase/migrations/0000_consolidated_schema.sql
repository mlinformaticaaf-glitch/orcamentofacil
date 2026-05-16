-- ============================================================
-- ORÇAMENTO FÁCIL - Schema Consolidado
-- Execute este script no SQL Editor do seu novo projeto Supabase
-- ============================================================

-- 1. CATEGORIES
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Target',
  monthly_goal NUMERIC NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT 'hsl(215, 80%, 55%)',
  type TEXT NOT NULL DEFAULT 'expense',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own categories" ON public.categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. ACCOUNTS
CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'checking',
  icon TEXT NOT NULL DEFAULT 'Landmark',
  color TEXT NOT NULL DEFAULT 'hsl(215, 80%, 55%)',
  initial_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own accounts" ON public.accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. CREDIT CARDS
CREATE TABLE public.credit_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  last_digits TEXT NOT NULL,
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  closing_day INTEGER NOT NULL DEFAULT 10,
  due_day INTEGER NOT NULL DEFAULT 20,
  color TEXT NOT NULL DEFAULT 'hsl(215, 80%, 55%)',
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own credit cards" ON public.credit_cards FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. EXPENSES
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_fixed BOOLEAN NOT NULL DEFAULT false,
  credit_card_id UUID REFERENCES public.credit_cards(id) ON DELETE SET NULL,
  installments INTEGER,
  current_installment INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own expenses" ON public.expenses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. INCOMES
CREATE TABLE public.incomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own incomes" ON public.incomes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TRIGGER: Cria categorias padrão ao cadastrar novo usuário
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_default_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, icon, color, monthly_goal, type) VALUES
    (NEW.id, 'Salário / Rendimentos', 'Briefcase', 'hsl(152, 69%, 40%)', 0, 'income'),
    (NEW.id, 'Vendas / Serviços', 'ShoppingBag', 'hsl(120, 50%, 40%)', 0, 'income'),
    (NEW.id, 'Outros ganhos', 'DollarSign', 'hsl(38, 92%, 50%)', 0, 'income'),
    (NEW.id, 'Moradia (aluguel, condomínio)', 'Home', 'hsl(215, 80%, 55%)', 0, 'expense'),
    (NEW.id, 'Contas básicas (água, luz, internet, telefone)', 'Zap', 'hsl(190, 70%, 45%)', 0, 'expense'),
    (NEW.id, 'Educação', 'GraduationCap', 'hsl(280, 65%, 55%)', 0, 'expense'),
    (NEW.id, 'Saúde', 'Heart', 'hsl(0, 72%, 51%)', 0, 'expense'),
    (NEW.id, 'Assinaturas / Mensalidades', 'Repeat', 'hsl(330, 65%, 50%)', 0, 'expense'),
    (NEW.id, 'Alimentação', 'UtensilsCrossed', 'hsl(38, 92%, 50%)', 0, 'expense'),
    (NEW.id, 'Transporte', 'Car', 'hsl(215, 80%, 55%)', 0, 'expense'),
    (NEW.id, 'Compras pessoais', 'ShoppingBag', 'hsl(280, 65%, 55%)', 0, 'expense'),
    (NEW.id, 'Lazer', 'Gamepad2', 'hsl(152, 69%, 40%)', 0, 'expense'),
    (NEW.id, 'Cartão de crédito', 'CreditCard', 'hsl(190, 70%, 45%)', 0, 'expense'),
    (NEW.id, 'Empréstimos / Parcelamentos', 'Landmark', 'hsl(0, 72%, 51%)', 0, 'expense');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_default_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_categories();


-- Create accounts table
CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'checking', -- checking, savings, wallet, other
  icon TEXT NOT NULL DEFAULT 'Landmark',
  color TEXT NOT NULL DEFAULT 'hsl(215, 80%, 55%)',
  initial_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own accounts"
  ON public.accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add account_id to expenses, incomes, credit_cards
ALTER TABLE public.expenses ADD COLUMN account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.incomes ADD COLUMN account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.credit_cards ADD COLUMN account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

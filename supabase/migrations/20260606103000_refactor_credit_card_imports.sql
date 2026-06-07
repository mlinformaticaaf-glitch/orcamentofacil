ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS original_description TEXT,
  ADD COLUMN IF NOT EXISTS invoice_month TEXT,
  ADD COLUMN IF NOT EXISTS installment_group_id TEXT,
  ADD COLUMN IF NOT EXISTS ofx_identifier TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_credit_card_duplicate_hash_idx
  ON public.expenses (user_id, credit_card_id, duplicate_hash)
  WHERE duplicate_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credit_card_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  reference_month TEXT NOT NULL,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  total_transactions NUMERIC NOT NULL DEFAULT 0,
  payments NUMERIC NOT NULL DEFAULT 0,
  adjustments NUMERIC NOT NULL DEFAULT 0,
  closing_balance NUMERIC NOT NULL DEFAULT 0,
  transferred_balance NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, credit_card_id, reference_month)
);

ALTER TABLE public.credit_card_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own credit card invoices"
  ON public.credit_card_invoices
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.credit_card_rename_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_original TEXT NOT NULL,
  summary_name TEXT NOT NULL,
  created_by_user BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, pattern_original)
);

ALTER TABLE public.credit_card_rename_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own credit card rename rules"
  ON public.credit_card_rename_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- Add status column to incomes (received / pending)
ALTER TABLE public.incomes ADD COLUMN status text NOT NULL DEFAULT 'pending';

-- Add status column to expenses (paid / pending)
ALTER TABLE public.expenses ADD COLUMN status text NOT NULL DEFAULT 'pending';

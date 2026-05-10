-- Add optional category_id to incomes table
ALTER TABLE public.incomes ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

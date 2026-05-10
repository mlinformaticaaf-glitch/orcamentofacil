-- Add type column to categories (expense or income)
ALTER TABLE public.categories ADD COLUMN type text NOT NULL DEFAULT 'expense';

-- Update existing income-related categories
UPDATE public.categories SET type = 'income' WHERE name IN ('Salário / Rendimentos', 'Vendas / Serviços', 'Outros ganhos');
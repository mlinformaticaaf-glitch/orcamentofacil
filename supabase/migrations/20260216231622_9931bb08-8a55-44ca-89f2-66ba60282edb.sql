
-- Insert default categories for all existing users
INSERT INTO public.categories (user_id, name, icon, color, monthly_goal)
SELECT u.id, cat.name, cat.icon, cat.color, 0
FROM auth.users u
CROSS JOIN (VALUES
  ('Salário / Rendimentos', 'Briefcase', 'hsl(152, 69%, 40%)'),
  ('Vendas / Serviços', 'ShoppingBag', 'hsl(215, 80%, 55%)'),
  ('Outros ganhos', 'Target', 'hsl(280, 65%, 55%)'),
  ('Moradia (aluguel, condomínio)', 'Home', 'hsl(38, 92%, 50%)'),
  ('Contas básicas (água, luz, internet, telefone)', 'Target', 'hsl(190, 70%, 45%)'),
  ('Educação', 'GraduationCap', 'hsl(330, 65%, 50%)'),
  ('Saúde', 'Heart', 'hsl(0, 72%, 51%)'),
  ('Assinaturas / Mensalidades', 'Target', 'hsl(120, 50%, 40%)'),
  ('Alimentação', 'UtensilsCrossed', 'hsl(38, 92%, 50%)'),
  ('Transporte', 'Car', 'hsl(215, 80%, 55%)'),
  ('Compras pessoais', 'ShoppingBag', 'hsl(280, 65%, 55%)'),
  ('Lazer', 'Gamepad2', 'hsl(152, 69%, 40%)'),
  ('Cartão de crédito', 'Target', 'hsl(0, 72%, 51%)'),
  ('Empréstimos / Parcelamentos', 'Target', 'hsl(330, 65%, 50%)')
) AS cat(name, icon, color)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.user_id = u.id AND c.name = cat.name
);

-- Create function to insert default categories for new users
CREATE OR REPLACE FUNCTION public.create_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, icon, color, monthly_goal) VALUES
    (NEW.id, 'Salário / Rendimentos', 'Briefcase', 'hsl(152, 69%, 40%)', 0),
    (NEW.id, 'Vendas / Serviços', 'ShoppingBag', 'hsl(215, 80%, 55%)', 0),
    (NEW.id, 'Outros ganhos', 'Target', 'hsl(280, 65%, 55%)', 0),
    (NEW.id, 'Moradia (aluguel, condomínio)', 'Home', 'hsl(38, 92%, 50%)', 0),
    (NEW.id, 'Contas básicas (água, luz, internet, telefone)', 'Target', 'hsl(190, 70%, 45%)', 0),
    (NEW.id, 'Educação', 'GraduationCap', 'hsl(330, 65%, 50%)', 0),
    (NEW.id, 'Saúde', 'Heart', 'hsl(0, 72%, 51%)', 0),
    (NEW.id, 'Assinaturas / Mensalidades', 'Target', 'hsl(120, 50%, 40%)', 0),
    (NEW.id, 'Alimentação', 'UtensilsCrossed', 'hsl(38, 92%, 50%)', 0),
    (NEW.id, 'Transporte', 'Car', 'hsl(215, 80%, 55%)', 0),
    (NEW.id, 'Compras pessoais', 'ShoppingBag', 'hsl(280, 65%, 55%)', 0),
    (NEW.id, 'Lazer', 'Gamepad2', 'hsl(152, 69%, 40%)', 0),
    (NEW.id, 'Cartão de crédito', 'Target', 'hsl(0, 72%, 51%)', 0),
    (NEW.id, 'Empréstimos / Parcelamentos', 'Target', 'hsl(330, 65%, 50%)', 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on auth.users for new signups
CREATE TRIGGER on_auth_user_created_default_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_categories();

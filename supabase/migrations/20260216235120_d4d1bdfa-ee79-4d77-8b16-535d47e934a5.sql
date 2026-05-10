-- Update the default categories function to include type
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
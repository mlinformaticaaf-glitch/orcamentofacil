import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else if (!isLogin) {
      toast({ title: 'Conta criada!', description: 'Você já está logado.' });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="glass-card w-full max-w-sm p-6 space-y-6">
        <div className="text-center">
          <img src="/pwa-192x192.png" alt="Orçamento Fácil" className="w-12 h-12 rounded-xl mx-auto mb-3" />
          <h1 className="font-display font-bold text-2xl">Orçamento Fácil</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLogin ? 'Entre na sua conta' : 'Crie sua conta'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
          </div>
          <div>
            <Label>Senha</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Carregando...' : isLogin ? 'Entrar' : 'Criar Conta'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? 'Não tem conta?' : 'Já tem conta?'}{' '}
          <button className="text-primary font-medium hover:underline" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { MapPin, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/stores';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export function SignupPage() {
  const [, setLocation] = useLocation();
  const setUser = useAuthStore((s) => s.setUser);
  const setSubscription = useAuthStore((s) => s.setSubscription);
  const { toast } = useToast();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !password || !confirmPassword) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos',
        variant: 'destructive',
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: 'Erro',
        description: 'As senhas não coincidem',
        variant: 'destructive',
      });
      return;
    }

    if (password.length < 4) {
      toast({
        title: 'Erro',
        description: 'A senha deve ter pelo menos 4 caracteres',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/auth/signup', { name, email, password });
      const data = await response.json();
      
      if (data.user) {
        setUser(data.user);
        if (data.subscription) {
          setSubscription(data.subscription);
        }
        setLocation('/plan');
        toast({
          title: 'Conta criada!',
          description: 'Bem-vindo ao OptiRota! Você tem 16 dias de teste grátis.',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro no cadastro',
        description: error.message || 'Não foi possível criar a conta',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-chart-2/10 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
              <img 
                src="/pwa/icons/icon-96.png" 
                alt="OptiRota" 
                className="h-14 w-14 rounded-2xl shadow-lg"
              />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground" data-testid="text-title">
                OptiRota
              </h1>
              <p className="text-muted-foreground mt-1">
                Crie sua conta gratuita
              </p>
            </div>
          </div>

          <Card className="shadow-xl border-0 bg-card/80 backdrop-blur">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Cadastro
              </CardTitle>
              <CardDescription>
                Preencha os dados para criar sua conta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="text"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-12"
                    data-testid="input-name"
                  />
                </div>
                <div className="space-y-2">
                  <Input
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12"
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="Senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12"
                    data-testid="input-password"
                  />
                </div>
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="Confirmar senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12"
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-semibold"
                  disabled={isLoading}
                  data-testid="button-signup"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Criando conta...
                    </div>
                  ) : (
                    'Criar conta'
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Já tem uma conta?{' '}
                  <Link 
                    href="/login" 
                    className="text-primary font-medium hover:underline"
                    data-testid="link-login"
                  >
                    Fazer login
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-muted-foreground">
        <p>Desenvolvido para entregadores autônomos</p>
      </footer>
    </div>
  );
}

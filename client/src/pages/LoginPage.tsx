import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { MapPin, Truck, DollarSign, Navigation, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/stores';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export function LoginPage() {
  const [, setLocation] = useLocation();
  const setUser = useAuthStore((s) => s.setUser);
  const setSubscription = useAuthStore((s) => s.setSubscription);
  const { toast } = useToast();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const prefetchData = async () => {
    setLoadingMessage('Carregando configurações...');
    await queryClient.prefetchQuery({ queryKey: ['/api/settings'] });
    
    setLoadingMessage('Carregando itinerário...');
    await queryClient.prefetchQuery({ queryKey: ['/api/itinerary'] });
    
    setLoadingMessage('Carregando paradas...');
    await queryClient.prefetchQuery({ queryKey: ['/api/stops'] });
    
    setLoadingMessage('Carregando histórico...');
    await queryClient.prefetchQuery({ queryKey: ['/api/itinerary/history'] });
    
    setLoadingMessage('Preparando aplicativo...');
    await queryClient.prefetchQuery({ queryKey: ['/api/subscription'] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      setLoadingMessage('Autenticando...');
      const response = await apiRequest('POST', '/api/auth/login', { email, password });
      const data = await response.json();
      
      if (data.user) {
        setUser(data.user);
        if (data.subscription) {
          setSubscription(data.subscription);
        }
        
        await prefetchData();
        
        setLocation('/plan');
        toast({
          title: 'Bem-vindo!',
          description: 'Login realizado com sucesso',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro no login',
        description: 'Verifique suas credenciais',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const features = [
    { icon: Navigation, text: 'Otimize suas rotas' },
    { icon: Truck, text: 'Gerencie entregas' },
    { icon: DollarSign, text: 'Controle seus ganhos' },
  ];

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
                Gestão inteligente de entregas
              </p>
            </div>
          </div>

          <Card className="shadow-xl border-0 bg-card/80 backdrop-blur">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl">Entrar</CardTitle>
              <CardDescription>
                Use qualquer email e senha para acessar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
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
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-semibold"
                  disabled={isLoading}
                  data-testid="button-login"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {loadingMessage || 'Entrando...'}
                    </div>
                  ) : (
                    'Entrar'
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Não tem conta?{' '}
                  <Link 
                    href="/signup" 
                    className="text-primary font-medium hover:underline"
                    data-testid="link-signup"
                  >
                    Criar conta
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center gap-6">
            {features.map((feature, index) => (
              <div key={index} className="flex flex-col items-center gap-2 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-sm">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground max-w-16">
                  {feature.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-muted-foreground">
        <p>Desenvolvido para entregadores autônomos</p>
      </footer>
    </div>
  );
}

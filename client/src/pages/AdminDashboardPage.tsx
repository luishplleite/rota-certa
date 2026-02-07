import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Shield, LogOut, Users, Calendar, Edit, Settings, DollarSign } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  subscription: {
    id: string;
    plan: string;
    status: string;
    trialStartDate: string;
    trialEndDate: string;
    paidStartDate: string | null;
    paidEndDate: string | null;
  } | null;
}

interface Admin {
  id: string;
  email: string;
  name: string;
}

interface AdminSettings {
  subscriptionPrice: number;
}

export function AdminDashboardPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [trialDays, setTrialDays] = useState('');
  const [paidDays, setPaidDays] = useState('30');
  const [subscriptionPrice, setSubscriptionPrice] = useState('29.90');

  const { data: settingsData } = useQuery<AdminSettings>({
    queryKey: ['/api/admin/settings'],
  });

  useEffect(() => {
    if (settingsData?.subscriptionPrice) {
      setSubscriptionPrice(String(settingsData.subscriptionPrice));
    }
  }, [settingsData]);

  const { data: adminData, isLoading: adminLoading } = useQuery<{ admin: Admin }>({
    queryKey: ['/api/admin/me'],
    retry: false,
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery<{ accounts: Account[] }>({
    queryKey: ['/api/admin/accounts'],
    enabled: !!adminData?.admin,
  });

  useEffect(() => {
    if (!adminLoading && !adminData?.admin) {
      navigate('/admin/login');
    }
  }, [adminData, adminLoading, navigate]);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/admin/logout', {});
    },
    onSuccess: () => {
      navigate('/admin/login');
    },
  });

  const updateTrialMutation = useMutation({
    mutationFn: async ({ accountId, days }: { accountId: string; days: number }) => {
      const response = await apiRequest('PATCH', `/api/admin/accounts/${accountId}/trial`, { trialDays: days });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Trial atualizado com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/accounts'] });
      setSelectedAccount(null);
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar trial', variant: 'destructive' });
    },
  });

  const activateSubscriptionMutation = useMutation({
    mutationFn: async ({ accountId, days }: { accountId: string; days: number }) => {
      const response = await apiRequest('PATCH', `/api/admin/accounts/${accountId}/subscription`, { 
        plan: 'basic', 
        daysToAdd: days 
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Assinatura ativada com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/accounts'] });
      setSelectedAccount(null);
    },
    onError: () => {
      toast({ title: 'Erro ao ativar assinatura', variant: 'destructive' });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (price: number) => {
      const response = await apiRequest('PATCH', '/api/admin/settings', { subscriptionPrice: price });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Valor da assinatura atualizado!' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar valor', variant: 'destructive' });
    },
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const getDaysRemaining = (endDate: string | null) => {
    if (!endDate) return 0;
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const getStatusBadge = (account: Account) => {
    if (!account.subscription) return <span className="text-muted-foreground">Sem assinatura</span>;
    
    const { plan, paidEndDate, trialEndDate } = account.subscription;
    
    if (plan !== 'trial' && paidEndDate) {
      const daysLeft = getDaysRemaining(paidEndDate);
      if (daysLeft > 0) {
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Ativo</span>;
      }
      return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">Expirado</span>;
    }
    
    const trialDaysLeft = getDaysRemaining(trialEndDate);
    if (trialDaysLeft > 0) {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">Trial</span>;
    }
    return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">Trial Expirado</span>;
  };

  const getTimeRemaining = (account: Account) => {
    if (!account.subscription) return '-';
    
    const { plan, paidEndDate, trialEndDate } = account.subscription;
    
    if (plan !== 'trial' && paidEndDate) {
      const daysLeft = getDaysRemaining(paidEndDate);
      if (daysLeft > 0) {
        return <span className="text-green-600 font-medium">{daysLeft} dias</span>;
      }
      return <span className="text-red-600">Vencido</span>;
    }
    
    const trialDaysLeft = getDaysRemaining(trialEndDate);
    if (trialDaysLeft > 0) {
      return <span className="text-yellow-600 font-medium">{trialDaysLeft} dias</span>;
    }
    return <span className="text-red-600">Vencido</span>;
  };

  if (adminLoading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!adminData?.admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Painel Administrativo</h1>
              <p className="text-sm text-muted-foreground">{adminData.admin.email}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => logoutMutation.mutate()}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuracoes de Assinatura
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-xs">
                <Label htmlFor="subscription-price">Valor mensal da assinatura (R$)</Label>
                <div className="flex items-center gap-2 mt-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="subscription-price"
                    type="text"
                    inputMode="decimal"
                    value={subscriptionPrice}
                    onChange={(e) => setSubscriptionPrice(e.target.value)}
                    placeholder="29.90"
                  />
                </div>
              </div>
              <Button 
                onClick={() => {
                  const price = parseFloat(subscriptionPrice.replace(',', '.'));
                  if (!isNaN(price) && price > 0) {
                    updateSettingsMutation.mutate(price);
                  } else {
                    toast({ title: 'Valor invalido', variant: 'destructive' });
                  }
                }}
                disabled={updateSettingsMutation.isPending}
              >
                Salvar Valor
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Este valor sera exibido para usuarios quando forem assinar.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Contas e Assinaturas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {accountsLoading ? (
              <p>Carregando contas...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Cadastro</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tempo Restante</TableHead>
                      <TableHead>Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountsData?.accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell>{account.email}</TableCell>
                        <TableCell>{formatDate(account.createdAt)}</TableCell>
                        <TableCell>{getStatusBadge(account)}</TableCell>
                        <TableCell>{getTimeRemaining(account)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedAccount(account);
                              const daysLeft = getDaysRemaining(account.subscription?.trialEndDate || null);
                              setTrialDays(String(daysLeft));
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!selectedAccount} onOpenChange={() => setSelectedAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerenciar Conta</DialogTitle>
            <DialogDescription>
              {selectedAccount?.name} - {selectedAccount?.email}
            </DialogDescription>
          </DialogHeader>
          {selectedAccount && (
            <div className="space-y-6">
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Status Atual</h4>
                <p className="text-sm text-muted-foreground">
                  Plano: {selectedAccount.subscription?.plan || 'Nenhum'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Trial termina: {formatDate(selectedAccount.subscription?.trialEndDate || null)}
                </p>
                {selectedAccount.subscription?.paidEndDate && (
                  <p className="text-sm text-muted-foreground">
                    Assinatura termina: {formatDate(selectedAccount.subscription.paidEndDate)}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Ajustar Trial (dias a partir de hoje)</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="number"
                      min="0"
                      value={trialDays}
                      onChange={(e) => setTrialDays(e.target.value)}
                      placeholder="Dias de trial"
                    />
                    <Button
                      onClick={() => updateTrialMutation.mutate({
                        accountId: selectedAccount.id,
                        days: parseInt(trialDays) || 0,
                      })}
                      disabled={updateTrialMutation.isPending}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Atualizar Trial
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Label>Ativar Assinatura Paga</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="number"
                      min="1"
                      value={paidDays}
                      onChange={(e) => setPaidDays(e.target.value)}
                      placeholder="Dias de assinatura"
                    />
                    <Button
                      variant="default"
                      onClick={() => activateSubscriptionMutation.mutate({
                        accountId: selectedAccount.id,
                        days: parseInt(paidDays) || 30,
                      })}
                      disabled={activateSubscriptionMutation.isPending}
                    >
                      Ativar ({paidDays} dias)
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

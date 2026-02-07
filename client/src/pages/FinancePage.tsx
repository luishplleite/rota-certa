import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  TrendingUp, TrendingDown, Wallet, Calendar, Award, Lock, AlertTriangle,
  Fuel, UtensilsCrossed, Wrench, MoreHorizontal, Plus, Trash2,
  HandCoins, Gift, Truck, CircleDollarSign, CheckCircle, Clock,
  FileDown, ChevronDown, ChevronUp, BarChart3
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAuthStore, useSettingsStore } from '@/lib/stores';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Expense, ExpenseCategory, Income, IncomeCategory, FinancialCycle, FinancialCycleStatus } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { PaymentModal } from '@/components/PaymentModal';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FinanceSummary {
  date: string;
  deliveries: number;
  earnings: {
    base: number;
    bonus: number;
    deliveryTotal: number;
    otherIncomes: number;
    total: number;
  };
  incomes: {
    total: number;
    byCategory: Record<string, number>;
    items: Income[];
  };
  expenses: {
    total: number;
    byCategory: Record<string, number>;
    items: Expense[];
  };
  netProfit: number;
  isSunday: boolean;
  bonusProgress: {
    current: number;
    target: number;
    achieved: boolean;
  } | null;
}

interface BonusDetail {
  earnedDate: string;
  earnedQuinzena: string;
  paymentQuinzena: string;
  deliveries: number;
  value: number;
}

interface CycleData {
  currentCycle: {
    startDate: string;
    endDate: string;
    daysRemaining: number;
    deliveries: number;
    earnings: {
      base: number;
      bonus: number;
      bonusEarnedThisCycle?: number;
      otherIncomes: number;
      total: number;
    };
    bonusDetails?: {
      earned: BonusDetail[];
      paid: BonusDetail[];
    };
    expenses: number;
    netProfit: number;
  };
  history: FinancialCycle[];
  dailyStats: Array<{ date: string; delivered: number; failed: number; earnings: number }>;
}

const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string; icon: typeof Fuel; color: string }[] = [
  { id: 'fuel', label: 'Combustível', icon: Fuel, color: 'text-orange-500' },
  { id: 'food', label: 'Refeição', icon: UtensilsCrossed, color: 'text-green-500' },
  { id: 'maintenance', label: 'Manutenção', icon: Wrench, color: 'text-blue-500' },
  { id: 'other', label: 'Outros', icon: MoreHorizontal, color: 'text-gray-500' },
];

const INCOME_CATEGORIES: { id: IncomeCategory; label: string; icon: typeof HandCoins; color: string }[] = [
  { id: 'tip', label: 'Gorjeta', icon: HandCoins, color: 'text-yellow-500' },
  { id: 'bonus', label: 'Bônus', icon: Gift, color: 'text-purple-500' },
  { id: 'extra_delivery', label: 'Extra', icon: Truck, color: 'text-blue-500' },
  { id: 'other', label: 'Outros', icon: CircleDollarSign, color: 'text-green-500' },
];

function getExpenseCategoryInfo(category: ExpenseCategory) {
  return EXPENSE_CATEGORIES.find(c => c.id === category) || EXPENSE_CATEGORIES[3];
}

function getIncomeCategoryInfo(category: IncomeCategory) {
  return INCOME_CATEGORIES.find(c => c.id === category) || INCOME_CATEGORIES[3];
}

function formatCycleDate(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatShortDate(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getStatusBadge(status: FinancialCycleStatus) {
  switch (status) {
    case 'paid':
      return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Pago</Badge>;
    case 'pending':
      return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    default:
      return <Badge variant="secondary">Em Andamento</Badge>;
  }
}

export function FinancePage() {
  const subscription = useAuthStore((s) => s.subscription);
  const settings = useSettingsStore((s) => s.settings);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<ExpenseCategory | null>(null);
  const [selectedIncomeCategory, setSelectedIncomeCategory] = useState<IncomeCategory | null>(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeDescription, setIncomeDescription] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [todayDetailsOpen, setTodayDetailsOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const { data: priceData } = useQuery<{ subscriptionPrice: number }>({
    queryKey: ['/api/subscription/price'],
  });
  
  const subscriptionPrice = priceData?.subscriptionPrice || 29.90;
  const formatSubscriptionPrice = (price: number) => price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const { data: summary, isLoading } = useQuery<FinanceSummary>({
    queryKey: ['/api/finance/summary'],
    refetchOnWindowFocus: false,
  });

  const { data: cycleData } = useQuery<CycleData>({
    queryKey: ['/api/finance/cycle'],
    refetchOnWindowFocus: false,
  });

  const createExpenseMutation = useMutation({
    mutationFn: async (data: { category: ExpenseCategory; amount: number; description?: string }) => {
      return apiRequest('POST', '/api/expenses', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/cycle'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
      resetExpenseForm();
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/cycle'] });
      queryClient.invalidateQueries({ queryKey: ['/api/expenses'] });
    },
  });

  const createIncomeMutation = useMutation({
    mutationFn: async (data: { category: IncomeCategory; amount: number; description?: string }) => {
      return apiRequest('POST', '/api/incomes', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/cycle'] });
      queryClient.invalidateQueries({ queryKey: ['/api/incomes'] });
      resetIncomeForm();
    },
  });

  const deleteIncomeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/incomes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/cycle'] });
      queryClient.invalidateQueries({ queryKey: ['/api/incomes'] });
    },
  });

  const updateCycleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FinancialCycleStatus }) => {
      return apiRequest('PATCH', `/api/finance/cycle/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/finance/cycle'] });
    },
  });

  const resetExpenseForm = () => {
    setExpenseModalOpen(false);
    setSelectedExpenseCategory(null);
    setExpenseAmount('');
    setExpenseDescription('');
  };

  const resetIncomeForm = () => {
    setIncomeModalOpen(false);
    setSelectedIncomeCategory(null);
    setIncomeAmount('');
    setIncomeDescription('');
  };

  const handleQuickExpense = (category: ExpenseCategory) => {
    setSelectedExpenseCategory(category);
    setExpenseModalOpen(true);
  };

  const handleQuickIncome = (category: IncomeCategory) => {
    setSelectedIncomeCategory(category);
    setIncomeModalOpen(true);
  };

  const handleSaveExpense = () => {
    if (!selectedExpenseCategory || !expenseAmount) return;
    
    const amount = parseFloat(expenseAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    createExpenseMutation.mutate({
      category: selectedExpenseCategory,
      amount,
      description: expenseDescription || undefined,
    });
  };

  const handleSaveIncome = () => {
    if (!selectedIncomeCategory || !incomeAmount) return;
    
    const amount = parseFloat(incomeAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    createIncomeMutation.mutate({
      category: selectedIncomeCategory,
      amount,
      description: incomeDescription || undefined,
    });
  };

  const handleGeneratePDF = (cycle: FinancialCycle | null = null) => {
    const doc = new jsPDF();
    let cycleStart: string;
    let cycleEnd: string;
    let summaryData: string[][];

    if (cycle) {
      cycleStart = cycle.cycleStart;
      cycleEnd = cycle.cycleEnd;
      summaryData = [
        ['Total de Entregas', String(cycle.deliveriesCount)],
        ['Ganhos Base', formatCurrency(cycle.baseEarnings)],
        ['Bonus', formatCurrency(cycle.bonusEarnings)],
        ['Outras Rendas', formatCurrency(cycle.otherIncomes)],
        ['Total Entradas', formatCurrency(cycle.totalEarnings)],
        ['Total Despesas', formatCurrency(cycle.totalExpenses)],
        ['Lucro Liquido', formatCurrency(cycle.netProfit)],
      ];
    } else if (cycleData?.currentCycle) {
      const current = cycleData.currentCycle;
      cycleStart = current.startDate;
      cycleEnd = current.endDate;
      summaryData = [
        ['Total de Entregas', String(current.deliveries)],
        ['Ganhos Base', formatCurrency(current.earnings.base)],
        ['Bonus', formatCurrency(current.earnings.bonus)],
        ['Outras Rendas', formatCurrency(current.earnings.otherIncomes)],
        ['Total Entradas', formatCurrency(current.earnings.total)],
        ['Total Despesas', formatCurrency(current.expenses)],
        ['Lucro Liquido', formatCurrency(current.netProfit)],
      ];
    } else {
      return;
    }
    
    doc.setFontSize(20);
    doc.text('OptiRota - Relatorio Financeiro', 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Periodo: ${formatCycleDate(cycleStart)} a ${formatCycleDate(cycleEnd)}`, 14, 32);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 40);

    autoTable(doc, {
      startY: 50,
      head: [['Descricao', 'Valor']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`optirota-relatorio-${cycleStart}-${cycleEnd}.pdf`);
  };

  const canAccessFinancials = subscription?.canAccessFinancials !== false;
  const isTrialExpired = subscription?.isTrialExpired === true;
  const trialDaysRemaining = subscription?.trialDaysRemaining ?? 16;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="flex flex-col gap-3 sm:gap-4 p-3 sm:p-4 pb-20 overflow-y-auto max-h-[calc(100vh-8rem)]">
      {subscription?.plan === 'trial' && !isTrialExpired && (
        <Alert className="border-chart-3 bg-chart-3/10">
          <Calendar className="h-4 w-4" />
          <AlertTitle>Periodo de teste</AlertTitle>
          <AlertDescription>
            Voce tem {trialDaysRemaining} dias restantes de teste gratis.
          </AlertDescription>
        </Alert>
      )}

      {isTrialExpired && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Periodo de teste expirado</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>Seu periodo de teste de 16 dias expirou. Os dados financeiros estao bloqueados.</p>
            <Button size="sm" className="mt-2" data-testid="button-subscribe" onClick={() => setPaymentModalOpen(true)}>
              Assinar agora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <PaymentModal open={paymentModalOpen} onOpenChange={setPaymentModalOpen} />

      {canAccessFinancials ? (
        <>
          {cycleData?.currentCycle && (
            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="pb-2 px-3 sm:px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    Ciclo Atual
                  </CardTitle>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleGeneratePDF()}
                    className="h-7 text-xs"
                  >
                    <FileDown className="h-3 w-3 mr-1" />
                    PDF
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  {formatCycleDate(cycleData.currentCycle.startDate)} a {formatCycleDate(cycleData.currentCycle.endDate)}
                  {cycleData.currentCycle.daysRemaining > 0 && (
                    <span className="ml-2 text-primary font-medium">
                      ({cycleData.currentCycle.daysRemaining} dias restantes)
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 space-y-3">
                {(() => {
                  const freteBruto = cycleData.currentCycle.earnings.base;
                  const bonusPago = cycleData.currentCycle.earnings.bonus;
                  const bonusConquistado = cycleData.currentCycle.earnings.bonusEarnedThisCycle || 0;
                  const valorBrutoTotal = freteBruto + bonusPago;
                  const baseCalculo = valorBrutoTotal * 0.20;
                  const inss = baseCalculo * 0.11;
                  const sestSenat = baseCalculo * 0.025;
                  const totalDescontos = inss + sestSenat;
                  const outrasRendas = cycleData.currentCycle.earnings.otherIncomes;
                  const despesas = cycleData.currentCycle.expenses;
                  const lucroLiquido = (valorBrutoTotal - totalDescontos) + outrasRendas - despesas;
                  const bonusDetails = cycleData.currentCycle.bonusDetails;
                  
                  const formatBonusDate = (dateStr: string) => {
                    const date = new Date(dateStr + 'T12:00:00');
                    return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
                  };
                  
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-background/50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-primary" data-testid="text-cycle-deliveries">{cycleData.currentCycle.deliveries}</p>
                          <p className="text-xs text-muted-foreground">Entregas</p>
                        </div>
                        <div className="bg-background/50 rounded-lg p-3 text-center">
                          <p className={`text-2xl font-bold ${lucroLiquido >= 0 ? 'text-green-500' : 'text-destructive'}`} data-testid="text-cycle-net-profit">
                            {formatCurrency(lucroLiquido)}
                          </p>
                          <p className="text-xs text-muted-foreground">Lucro Líquido*</p>
                        </div>
                      </div>

                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-xs text-amber-700 dark:text-amber-400">
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                          <p>*Valor estimado com descontos TAC (INSS 2,2% + SEST/SENAT 0,5%). Pode variar conforme a transportadora.</p>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ganhos entregas:</span>
                          <span className="text-green-500" data-testid="text-frete-bruto">{formatCurrency(freteBruto)}</span>
                        </div>
                        
                        {bonusPago > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Bônus recebido (quinzena anterior):</span>
                            <span className="text-purple-500" data-testid="text-bonus-pago">{formatCurrency(bonusPago)}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between font-medium border-t border-border/50 pt-1 mt-1">
                          <span className="text-muted-foreground">Valor bruto quinzena:</span>
                          <span className="text-green-500" data-testid="text-valor-bruto">{formatCurrency(valorBrutoTotal)}</span>
                        </div>
                        
                        <div className="flex justify-between text-muted-foreground/80">
                          <span className="pl-2">- INSS (2,2%):</span>
                          <span className="text-orange-500" data-testid="text-inss">-{formatCurrency(inss)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground/80">
                          <span className="pl-2">- SEST/SENAT (0,5%):</span>
                          <span className="text-orange-500" data-testid="text-sest-senat">-{formatCurrency(sestSenat)}</span>
                        </div>
                        
                        {outrasRendas > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Outras rendas:</span>
                            <span className="text-green-500" data-testid="text-outras-rendas">{formatCurrency(outrasRendas)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Despesas:</span>
                          <span className="text-destructive" data-testid="text-despesas">-{formatCurrency(despesas)}</span>
                        </div>
                      </div>

                      {bonusConquistado > 0 && bonusDetails?.earned && bonusDetails.earned.length > 0 && (
                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-2.5 space-y-2" data-testid="card-bonus-earned">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium flex items-center gap-1.5">
                              <Award className="h-3.5 w-3.5 text-purple-500" />
                              Bônus Conquistados (pagos na próxima quinzena)
                            </span>
                            <span className="text-sm font-bold text-purple-500" data-testid="text-bonus-conquistado">{formatCurrency(bonusConquistado)}</span>
                          </div>
                          <div className="space-y-1.5">
                            {bonusDetails.earned.map((b, idx) => (
                              <div key={idx} className="bg-background/50 rounded p-2 text-[10px] space-y-0.5" data-testid={`bonus-earned-${idx}`}>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Data:</span>
                                  <span className="font-medium">{formatBonusDate(b.earnedDate)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Quinzena lançamento:</span>
                                  <span>{b.earnedQuinzena}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Quinzena pagamento:</span>
                                  <span className="text-purple-500 font-medium">{b.paymentQuinzena}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Entregas:</span>
                                  <span>{b.deliveries} pacotes</span>
                                </div>
                                <div className="flex justify-between border-t border-border/30 pt-0.5 mt-0.5">
                                  <span className="text-muted-foreground">Valor:</span>
                                  <span className="text-purple-500 font-bold">{formatCurrency(b.value)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {bonusPago > 0 && bonusDetails?.paid && bonusDetails.paid.length > 0 && (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2.5 space-y-2" data-testid="card-bonus-paid">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium flex items-center gap-1.5">
                              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                              Detalhes Bônus Recebidos
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {bonusDetails.paid.map((b, idx) => (
                              <div key={idx} className="bg-background/50 rounded p-2 text-[10px] space-y-0.5" data-testid={`bonus-paid-${idx}`}>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Conquistado em:</span>
                                  <span className="font-medium">{formatBonusDate(b.earnedDate)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Quinzena origem:</span>
                                  <span>{b.earnedQuinzena}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Entregas:</span>
                                  <span>{b.deliveries} pacotes</span>
                                </div>
                                <div className="flex justify-between border-t border-border/30 pt-0.5 mt-0.5">
                                  <span className="text-muted-foreground">Valor:</span>
                                  <span className="text-green-500 font-bold">{formatCurrency(b.value)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

              </CardContent>
            </Card>
          )}

          {cycleData?.dailyStats && cycleData.dailyStats.length > 0 && (
            <Card>
              <CardHeader className="pb-2 px-3 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                  Desempenho do Ciclo
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cycleData.dailyStats.map(d => ({
                      ...d,
                      name: formatShortDate(d.date)
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip 
                        formatter={(value: number, name: string) => {
                          if (name === 'earnings') return [formatCurrency(value), 'Ganhos'];
                          if (name === 'delivered') return [value, 'Entregas'];
                          return [value, name];
                        }}
                        labelFormatter={(label) => `Data: ${label}`}
                      />
                      <Bar dataKey="delivered" fill="hsl(var(--primary))" name="Entregas" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {cycleData?.history && cycleData.history.length > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 px-3 sm:px-6 cursor-pointer hover:bg-muted/50">
                    <CardTitle className="flex items-center justify-between text-base sm:text-lg">
                      <span className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
                        Historico de Ciclos
                      </span>
                      {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="px-3 sm:px-6 space-y-2">
                    {cycleData.history.map((cycle) => (
                      <div 
                        key={cycle.id}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">
                              {formatCycleDate(cycle.cycleStart)} - {formatCycleDate(cycle.cycleEnd)}
                            </span>
                            {getStatusBadge(cycle.status)}
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>{cycle.deliveriesCount} entregas</span>
                            <span className={cycle.netProfit >= 0 ? 'text-green-500' : 'text-destructive'}>
                              {formatCurrency(cycle.netProfit)}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {cycle.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => updateCycleStatusMutation.mutate({ id: cycle.id, status: 'paid' })}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Pago
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => handleGeneratePDF(cycle)}
                          >
                            <FileDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          <Collapsible open={todayDetailsOpen} onOpenChange={setTodayDetailsOpen}>
            <Card className="border-chart-2/30 bg-chart-2/5">
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 px-3 sm:px-6 cursor-pointer hover:bg-muted/50">
                  <CardTitle className="flex items-center justify-between text-base sm:text-lg">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-chart-2" />
                      Hoje - {formatDate(today)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-chart-2">
                        {formatCurrency(summary?.earnings.total || 0)}
                      </span>
                      {todayDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {summary?.deliveries || 0} entregas | Lucro: {formatCurrency(summary?.netProfit || 0)}
                  </CardDescription>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="px-3 sm:px-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium flex items-center gap-1">
                          <TrendingUp className="h-4 w-4 text-chart-2" />
                          Entradas
                        </span>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 text-xs"
                          onClick={() => setIncomeModalOpen(true)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xl font-bold text-chart-2">{formatCurrency(summary?.earnings.total || 0)}</p>
                      
                      <div className="grid grid-cols-2 gap-1 mt-2">
                        {INCOME_CATEGORIES.map((cat) => {
                          const Icon = cat.icon;
                          return (
                            <Button
                              key={cat.id}
                              variant="outline"
                              size="sm"
                              className="flex flex-col h-auto py-1 px-1"
                              onClick={() => handleQuickIncome(cat.id)}
                            >
                              <Icon className={`h-3 w-3 ${cat.color}`} />
                              <span className="text-[8px] mt-0.5">{cat.label}</span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium flex items-center gap-1">
                          <TrendingDown className="h-4 w-4 text-destructive" />
                          Saidas
                        </span>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 text-xs"
                          onClick={() => setExpenseModalOpen(true)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xl font-bold text-destructive">-{formatCurrency(summary?.expenses.total || 0)}</p>
                      
                      <div className="grid grid-cols-2 gap-1 mt-2">
                        {EXPENSE_CATEGORIES.map((cat) => {
                          const Icon = cat.icon;
                          return (
                            <Button
                              key={cat.id}
                              variant="outline"
                              size="sm"
                              className="flex flex-col h-auto py-1 px-1"
                              onClick={() => handleQuickExpense(cat.id)}
                            >
                              <Icon className={`h-3 w-3 ${cat.color}`} />
                              <span className="text-[8px] mt-0.5">{cat.label}</span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {summary?.incomes.items && summary.incomes.items.length > 0 && (
                    <div className="space-y-1 pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Outras rendas:</p>
                      {summary.incomes.items.slice(0, 3).map((income) => {
                        const catInfo = getIncomeCategoryInfo(income.category);
                        const Icon = catInfo.icon;
                        return (
                          <div key={income.id} className="flex items-center justify-between py-1 text-sm">
                            <div className="flex items-center gap-2">
                              <Icon className={`h-3 w-3 ${catInfo.color}`} />
                              <span className="text-xs">{income.description || catInfo.label}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-chart-2">+{formatCurrency(income.amount)}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => deleteIncomeMutation.mutate(income.id)}
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {summary?.expenses.items && summary.expenses.items.length > 0 && (
                    <div className="space-y-1 pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Despesas:</p>
                      {summary.expenses.items.slice(0, 3).map((expense) => {
                        const catInfo = getExpenseCategoryInfo(expense.category);
                        const Icon = catInfo.icon;
                        return (
                          <div key={expense.id} className="flex items-center justify-between py-1 text-sm">
                            <div className="flex items-center gap-2">
                              <Icon className={`h-3 w-3 ${catInfo.color}`} />
                              <span className="text-xs">{expense.description || catInfo.label}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-destructive">-{formatCurrency(expense.amount)}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => deleteExpenseMutation.mutate(expense.id)}
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {summary?.bonusProgress && (
            <Card className={summary.bonusProgress.achieved ? "border-chart-3 bg-chart-3/5" : ""}>
              <CardHeader className="pb-2 px-3 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Award className={`h-4 w-4 sm:h-5 sm:w-5 ${summary.bonusProgress.achieved ? 'text-chart-3' : 'text-muted-foreground'}`} />
                  Bonus de Domingo
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {summary.bonusProgress.achieved 
                    ? 'Parabens! Voce conquistou o bonus!'
                    : `Mais ${summary.bonusProgress.target - summary.bonusProgress.current} entregas para conquistar o bonus`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 px-3 sm:px-6">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-medium">
                    {summary.bonusProgress.current}/{summary.bonusProgress.target}
                  </span>
                </div>
                <Progress 
                  value={(summary.bonusProgress.current / summary.bonusProgress.target) * 100} 
                  className="h-2 sm:h-3" 
                />
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">Valor do bonus</span>
                  <span className="font-bold text-chart-3">
                    {formatCurrency(settings.sundayBonusValue)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {!summary?.isSunday && (
            <Card>
              <CardHeader className="pb-2 px-3 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Award className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                  Bonus de Domingo
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    Valido aos domingos
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Faca mais de {settings.sundayBonusThreshold} entregas no domingo para ganhar o bonus
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">Valor do bonus</span>
                  <span className="font-bold text-chart-3">
                    {formatCurrency(settings.sundayBonusValue)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="relative">
          <div className="blur-sm pointer-events-none select-none">
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Ciclo Atual</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-primary">R$ ---,--</p>
                  <p className="text-sm text-muted-foreground">Total Ganhos</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-green-500">R$ ---,--</p>
                  <p className="text-sm text-muted-foreground">Lucro Liquido</p>
                </div>
              </CardContent>
            </Card>
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Resumo de Hoje</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xl font-bold">--</p>
                  <p className="text-xs text-muted-foreground">Entregas</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold">R$ --,--</p>
                  <p className="text-xs text-muted-foreground">Ganhos</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold">R$ --,--</p>
                  <p className="text-xs text-muted-foreground">Despesas</p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm rounded-lg">
            <Card className="w-full max-w-sm mx-4 shadow-lg">
              <CardContent className="py-8 text-center">
                <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Dados Financeiros Bloqueados</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Seu periodo de teste expirou. Assine para ter acesso completo aos seus dados financeiros.
                </p>
                <Button className="w-full" onClick={() => setPaymentModalOpen(true)} data-testid="button-subscribe-cta">
                  Assinar por R$ {formatSubscriptionPrice(subscriptionPrice)}/mes
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              Lancar Despesa
            </DialogTitle>
            <DialogDescription>
              Adicione uma nova despesa para calcular seu lucro real
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <div className="grid grid-cols-4 gap-2">
                {EXPENSE_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = selectedExpenseCategory === cat.id;
                  return (
                    <Button
                      key={cat.id}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className="flex flex-col h-auto py-3"
                      onClick={() => setSelectedExpenseCategory(cat.id)}
                    >
                      <Icon className={`h-5 w-5 ${isSelected ? 'text-primary-foreground' : cat.color}`} />
                      <span className="text-[10px] mt-1">{cat.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-amount">Valor (R$)</Label>
              <Input
                id="expense-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-description">Descricao (opcional)</Label>
              <Input
                id="expense-description"
                type="text"
                placeholder="Ex: Gasolina posto X"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={resetExpenseForm}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveExpense}
              disabled={!selectedExpenseCategory || !expenseAmount || createExpenseMutation.isPending}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={incomeModalOpen} onOpenChange={setIncomeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-chart-2" />
              Lancar Renda Extra
            </DialogTitle>
            <DialogDescription>
              Adicione gorjetas, bonus e outras rendas
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <div className="grid grid-cols-4 gap-2">
                {INCOME_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = selectedIncomeCategory === cat.id;
                  return (
                    <Button
                      key={cat.id}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className="flex flex-col h-auto py-3"
                      onClick={() => setSelectedIncomeCategory(cat.id)}
                    >
                      <Icon className={`h-5 w-5 ${isSelected ? 'text-primary-foreground' : cat.color}`} />
                      <span className="text-[10px] mt-1">{cat.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="income-amount">Valor (R$)</Label>
              <Input
                id="income-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="income-description">Descricao (opcional)</Label>
              <Input
                id="income-description"
                type="text"
                placeholder="Ex: Gorjeta cliente X"
                value={incomeDescription}
                onChange={(e) => setIncomeDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={resetIncomeForm}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveIncome}
              disabled={!selectedIncomeCategory || !incomeAmount || createIncomeMutation.isPending}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

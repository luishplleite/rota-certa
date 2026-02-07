import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { savePendingPayment, clearPendingPayment } from '@/hooks/usePaymentMonitor';
import { CreditCard, QrCode, CheckCircle, Loader2, AlertCircle, Copy, Check } from 'lucide-react';

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PixPaymentData {
  paymentIntentId: string;
  pixQrCode: string;
  pixCode: string;
  expiresAt: string;
}

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[10])) return false;
  
  return true;
}

export function PaymentModal({ open, onOpenChange }: PaymentModalProps) {
  const { toast } = useToast();
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [pixData, setPixData] = useState<PixPaymentData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'loading' | 'waiting' | 'success' | 'error'>('idle');
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [cpf, setCpf] = useState('');
  const [cpfError, setCpfError] = useState('');

  const { data: priceData } = useQuery<{ subscriptionPrice: number }>({
    queryKey: ['/api/subscription/price'],
    enabled: open,
  });

  const subscriptionPrice = priceData?.subscriptionPrice || 29.90;

  const createPixMutation = useMutation({
    mutationFn: async (taxId: string) => {
      const response = await apiRequest('POST', '/api/payment/create-pix', { taxId });
      return response.json();
    },
    onSuccess: async (data) => {
      if (data.pixQrCode && data.pixCode) {
        setPaymentIntentId(data.paymentIntentId);
        setPixData({
          paymentIntentId: data.paymentIntentId,
          pixQrCode: data.pixQrCode,
          pixCode: data.pixCode,
          expiresAt: data.expiresAt,
        });
        setPaymentStatus('waiting');
        savePendingPayment(data.paymentIntentId, data.expiresAt);
      } else {
        setPaymentStatus('error');
        toast({ title: 'Erro ao gerar QR Code', variant: 'destructive' });
      }
    },
    onError: (error: any) => {
      setPaymentStatus('error');
      toast({ title: error.message || 'Erro ao criar pagamento', variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (paymentIntentId && paymentStatus === 'waiting') {
      const interval = window.setInterval(async () => {
        try {
          const response = await apiRequest('GET', `/api/payment/status/${paymentIntentId}`, undefined);
          const data = await response.json();
          
          if (data.status === 'succeeded') {
            setPaymentStatus('success');
            clearInterval(interval);
            clearPendingPayment();
            queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
            queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
            toast({ title: 'Pagamento confirmado!', description: 'Sua assinatura foi ativada por 30 dias.' });
          } else if (data.status === 'canceled' || data.status === 'payment_failed') {
            setPaymentStatus('error');
            clearInterval(interval);
            clearPendingPayment();
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 3000);
      
      setPollingInterval(interval);
      return () => clearInterval(interval);
    }
  }, [paymentIntentId, paymentStatus, toast]);

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCPF(e.target.value);
    setCpf(formatted);
    setCpfError('');
  };

  const handleStartPayment = () => {
    const digits = cpf.replace(/\D/g, '');
    
    if (!validateCPF(cpf)) {
      setCpfError('CPF invalido. Verifique os numeros.');
      return;
    }
    
    setPaymentStatus('loading');
    createPixMutation.mutate(digits);
  };

  const handleCopyPixCode = async () => {
    if (pixData?.pixCode) {
      await navigator.clipboard.writeText(pixData.pixCode);
      setCopied(true);
      toast({ title: 'Codigo Pix copiado!' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    setPaymentStatus('idle');
    setPaymentIntentId(null);
    setPixData(null);
    setCopied(false);
    setCpf('');
    setCpfError('');
    onOpenChange(false);
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Assinar OptiRota
          </DialogTitle>
          <DialogDescription>
            Desbloqueie todos os recursos financeiros
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {paymentStatus === 'idle' && (
            <>
              <div className="text-center p-6 bg-muted rounded-lg">
                <p className="text-3xl font-bold text-primary">R$ {formatPrice(subscriptionPrice)}</p>
                <p className="text-sm text-muted-foreground">por mes</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Incluido:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>- Acesso completo aos relatorios financeiros</li>
                  <li>- Calculos automaticos de ganhos</li>
                  <li>- Bonus de domingo configuravel</li>
                  <li>- Historico de rotas ilimitado</li>
                  <li>- Suporte prioritario</li>
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF (obrigatorio para Pix)</Label>
                <Input
                  id="cpf"
                  type="text"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={handleCpfChange}
                  maxLength={14}
                  className={cpfError ? 'border-destructive' : ''}
                />
                {cpfError && (
                  <p className="text-sm text-destructive">{cpfError}</p>
                )}
              </div>

              <Button 
                className="w-full" 
                onClick={handleStartPayment}
                disabled={cpf.replace(/\D/g, '').length !== 11}
              >
                <QrCode className="h-4 w-4 mr-2" />
                Pagar com Pix
              </Button>
            </>
          )}

          {paymentStatus === 'loading' && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <p className="mt-4 text-muted-foreground">Gerando QR Code...</p>
            </div>
          )}

          {paymentStatus === 'waiting' && pixData && (
            <div className="text-center py-4">
              <div className="mb-4 p-4 bg-white rounded-lg inline-block">
                <img 
                  src={pixData.pixQrCode} 
                  alt="QR Code Pix" 
                  className="w-48 h-48 mx-auto"
                />
              </div>
              <p className="font-medium mb-2">Escaneie o QR Code no app do seu banco</p>
              <p className="text-sm text-muted-foreground mb-4">
                Ou copie o codigo Pix abaixo:
              </p>
              
              <div className="space-y-2 mb-4">
                <div className="p-3 bg-muted rounded text-xs font-mono text-left break-all max-h-24 overflow-y-auto">
                  {pixData.pixCode}
                </div>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={handleCopyPixCode}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar codigo Pix
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguardando pagamento...
              </div>
            </div>
          )}

          {paymentStatus === 'success' && (
            <div className="text-center py-8">
              <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
              <p className="mt-4 text-lg font-medium">Pagamento Confirmado!</p>
              <p className="text-sm text-muted-foreground">
                Sua assinatura foi ativada por 30 dias.
              </p>
              <Button className="mt-4" onClick={handleClose}>
                Fechar
              </Button>
            </div>
          )}

          {paymentStatus === 'error' && (
            <div className="text-center py-8">
              <AlertCircle className="h-16 w-16 mx-auto text-destructive" />
              <p className="mt-4 text-lg font-medium">Erro no Pagamento</p>
              <p className="text-sm text-muted-foreground">
                Nao foi possivel processar o pagamento. Tente novamente.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => setPaymentStatus('idle')}>
                Tentar Novamente
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

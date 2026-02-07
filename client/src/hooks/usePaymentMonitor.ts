import { useEffect, useCallback } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const PENDING_PAYMENT_KEY = 'optirota_pending_payment';
const POLL_INTERVAL = 5000;

interface PendingPayment {
  paymentIntentId: string;
  createdAt: number;
  expiresAt?: string;
}

export function savePendingPayment(paymentIntentId: string, expiresAt?: string) {
  const payment: PendingPayment = {
    paymentIntentId,
    createdAt: Date.now(),
    expiresAt,
  };
  localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(payment));
}

export function clearPendingPayment() {
  localStorage.removeItem(PENDING_PAYMENT_KEY);
}

export function getPendingPayment(): PendingPayment | null {
  try {
    const data = localStorage.getItem(PENDING_PAYMENT_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function usePaymentMonitor() {
  const { toast } = useToast();

  const checkPaymentStatus = useCallback(async (paymentIntentId: string): Promise<'pending' | 'succeeded' | 'failed'> => {
    try {
      const response = await apiRequest('GET', `/api/payment/status/${paymentIntentId}`, undefined);
      const data = await response.json();
      
      if (data.status === 'succeeded') {
        return 'succeeded';
      } else if (data.status === 'canceled' || data.status === 'payment_failed') {
        return 'failed';
      }
      return 'pending';
    } catch (err) {
      console.error('Payment status check error:', err);
      return 'pending';
    }
  }, []);

  useEffect(() => {
    const checkPendingPayment = async () => {
      const pending = getPendingPayment();
      if (!pending) return;

      const maxAge = 30 * 60 * 1000;
      if (Date.now() - pending.createdAt > maxAge) {
        clearPendingPayment();
        return;
      }

      if (pending.expiresAt) {
        const expiresAt = new Date(pending.expiresAt).getTime();
        if (Date.now() > expiresAt) {
          clearPendingPayment();
          return;
        }
      }

      const status = await checkPaymentStatus(pending.paymentIntentId);
      
      if (status === 'succeeded') {
        clearPendingPayment();
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
        toast({ 
          title: 'Pagamento confirmado!', 
          description: 'Sua assinatura foi ativada por 30 dias.',
        });
      } else if (status === 'failed') {
        clearPendingPayment();
      }
    };

    checkPendingPayment();

    const interval = setInterval(checkPendingPayment, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [checkPaymentStatus, toast]);
}

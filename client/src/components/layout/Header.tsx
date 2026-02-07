import { useState } from 'react';
import { MapPin, DollarSign, LogOut, Lock, Clock, Settings, AlertTriangle, User, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuthStore, useItineraryStore } from '@/lib/stores';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';
import { PaymentModal } from '@/components/PaymentModal';

export function Header() {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const [, setLocation] = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const subscription = useAuthStore((s) => s.subscription);
  const getEarnings = useItineraryStore((s) => s.getEarnings);
  const getDeliveredCount = useItineraryStore((s) => s.getDeliveredCount);

  const earnings = getEarnings();
  const deliveredCount = getDeliveredCount();
  const canAccessFinancials = subscription?.canAccessFinancials !== false;
  const isTrialExpired = subscription?.isTrialExpired === true;
  const trialDaysRemaining = subscription?.trialDaysRemaining ?? 16;
  const subscriptionDaysRemaining = subscription?.subscriptionDaysRemaining;
  const isSubscriptionExpiringSoon = subscriptionDaysRemaining !== undefined && subscriptionDaysRemaining >= 0 && subscriptionDaysRemaining <= 1 && subscription?.plan !== 'trial';
  const showExpiryWarning = isSubscriptionExpiringSoon && !dismissedWarning && subscriptionDaysRemaining > 0;

  const handleLogout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
    } catch {
      // Ignore errors
    }
    logout();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card">
      {showExpiryWarning && (
        <div className="bg-amber-500 text-white px-4 py-2 text-sm flex items-center justify-between gap-2">
          <button 
            onClick={() => setDismissedWarning(true)}
            className="p-1 hover:bg-amber-600 rounded"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 justify-center flex-wrap">
            <AlertTriangle className="h-4 w-4" />
            <span>Sua assinatura vence amanha!</span>
            <Button 
              size="sm" 
              variant="secondary" 
              className="h-6 text-xs px-2"
              onClick={() => setShowPaymentModal(true)}
            >
              Renovar
            </Button>
          </div>
          <div className="w-6"></div>
        </div>
      )}
      <PaymentModal open={showPaymentModal} onOpenChange={setShowPaymentModal} />
      <div className="flex h-14 items-center justify-between px-2 sm:px-4 gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <img 
            src="/pwa/icons/icon-48.png" 
            alt="OptiRota" 
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg"
          />
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-bold text-foreground leading-tight" data-testid="text-logo">
              OptiRota
            </span>
            {user?.name && (
              <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
                Ola, {user.name.split(' ')[0]}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {subscription?.plan === 'trial' && !isTrialExpired && (
            <Badge variant="outline" className="text-[10px] sm:text-xs gap-0.5 sm:gap-1 px-1.5 sm:px-2">
              <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              <span>{trialDaysRemaining}d</span>
            </Badge>
          )}

          <div className="flex items-center gap-1 text-xs sm:text-sm" data-testid="text-delivery-count">
            <span className="font-medium text-foreground">
              {deliveredCount}
            </span>
            <span className="text-muted-foreground hidden sm:inline">entregas</span>
            <span className="text-muted-foreground sm:hidden">ent</span>
          </div>

          <div className="flex items-center gap-1" data-testid="text-earnings">
            {canAccessFinancials ? (
              <>
                <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-chart-2" />
                <span className="font-semibold text-chart-2 text-xs sm:text-sm">
                  {formatCurrency(earnings.total)}
                </span>
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                <span className="font-semibold text-muted-foreground text-xs sm:text-sm">
                  ***
                </span>
              </>
            )}
          </div>

          {user && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation('/settings')}
                title="Configuracoes"
                className="h-8 w-8"
                data-testid="button-settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="Sair"
                className="h-8 w-8"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

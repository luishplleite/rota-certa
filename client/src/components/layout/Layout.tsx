import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { usePaymentMonitor } from '@/hooks/usePaymentMonitor';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useNavigationStore } from '@/lib/navigationStore';
import { WifiOff, RefreshCw } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  usePaymentMonitor();
  const { isOnline, isSyncing, pendingCount } = useOfflineSync();
  const [location] = useLocation();
  const { setLastPath } = useNavigationStore();

  // Save current path whenever it changes
  useEffect(() => {
    if (location && location !== '/login' && location !== '/signup') {
      setLastPath(location);
    }
  }, [location, setLastPath]);
  
  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-background">
      <Header />
      
      {/* Offline indicator */}
      {(!isOnline || pendingCount > 0) && (
        <div className={`px-3 py-1.5 text-xs font-medium flex items-center justify-center gap-2 ${
          isOnline ? 'bg-amber-500 text-white' : 'bg-destructive text-destructive-foreground'
        }`}>
          {!isOnline ? (
            <>
              <WifiOff className="h-3 w-3" />
              <span>Modo offline - alterações serão sincronizadas quando a internet voltar</span>
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Sincronizando {pendingCount} {pendingCount === 1 ? 'operação' : 'operações'}...</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3" />
              <span>{pendingCount} {pendingCount === 1 ? 'alteração pendente' : 'alterações pendentes'}</span>
            </>
          )}
        </div>
      )}
      
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

import { Link, useLocation } from 'wouter';
import { ClipboardList, Navigation, Wallet, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useItineraryStore } from '@/lib/stores';

export function BottomNav() {
  const [location] = useLocation();
  const stops = useItineraryStore((s) => s.stops);
  
  const isRouteStarted = stops.some(
    stop => stop.status === 'current' || stop.status === 'delivered' || stop.status === 'failed'
  );

  const navItems = [
    {
      to: '/plan',
      icon: ClipboardList,
      label: 'Planejar',
      disabled: false,
    },
    {
      to: '/drive',
      icon: isRouteStarted ? Navigation : Lock,
      label: 'Dirigir',
      disabled: !isRouteStarted,
    },
    {
      to: '/finance',
      icon: Wallet,
      label: 'Ganhos',
      disabled: false,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-card safe-area-inset-bottom" style={{ zIndex: 1100 }}>
      <div className="flex h-14 sm:h-16 items-center justify-around max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.to;
          
          if (item.disabled) {
            return (
              <div
                key={item.to}
                className="flex flex-col items-center justify-center gap-1 px-4 py-2 text-muted-foreground/50 cursor-not-allowed"
                data-testid={`nav-${item.to.replace('/', '')}`}
              >
                <item.icon
                  className="h-6 w-6"
                  strokeWidth={2}
                />
                <span className="text-xs font-medium">{item.label}</span>
              </div>
            );
          }
          
          return (
            <Link
              key={item.to}
              href={item.to}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-4 py-2 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              data-testid={`nav-${item.to.replace('/', '')}`}
            >
              <item.icon
                className={cn(
                  'h-6 w-6 transition-transform',
                  isActive && 'scale-110'
                )}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

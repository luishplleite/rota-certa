import { useState, useEffect } from 'react';
import { Navigation, MapPinned, ExternalLink, Smartphone } from 'lucide-react';
import { SiWaze, SiGooglemaps } from 'react-icons/si';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getNavigationUrl } from '@/lib/utils';
import type { Stop } from '@shared/schema';

interface NavigationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stop: Stop | null;
  onStartInternalNavigation?: (stop: Stop) => void;
}

export function NavigationModal({ 
  open, 
  onOpenChange, 
  stop,
  onStartInternalNavigation 
}: NavigationModalProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor;
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      setIsMobile(mobileRegex.test(userAgent.toLowerCase()));
    };
    checkMobile();
  }, []);

  if (!stop) return null;

  const handleGoogleMaps = () => {
    const url = getNavigationUrl(
      { latitude: stop.latitude, longitude: stop.longitude },
      'google_maps'
    );
    window.open(url, '_blank');
    onOpenChange(false);
  };

  const handleWaze = () => {
    const url = getNavigationUrl(
      { latitude: stop.latitude, longitude: stop.longitude },
      'waze'
    );
    window.open(url, '_blank');
    onOpenChange(false);
  };

  const handleInternalNavigation = () => {
    if (onStartInternalNavigation) {
      onStartInternalNavigation(stop);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Escolher Navegação
          </DialogTitle>
          <DialogDescription>
            Selecione como deseja navegar até o destino
          </DialogDescription>
        </DialogHeader>
        
        <div className="p-3 bg-muted rounded-lg mb-4">
          <p className="font-medium text-sm">{stop.addressFull.split(',')[0]}</p>
          <p className="text-xs text-muted-foreground truncate">
            {stop.addressFull.split(',').slice(1, 3).join(',').trim()}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Apps Externos</p>
          
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={handleGoogleMaps}
            data-testid="button-nav-google-maps"
          >
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-500/10">
              <SiGooglemaps className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium">Google Maps</p>
              <p className="text-xs text-muted-foreground">Abrir no aplicativo</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={handleWaze}
            data-testid="button-nav-waze"
          >
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-cyan-500/10">
              <SiWaze className="h-5 w-5 text-cyan-500" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium">Waze</p>
              <p className="text-xs text-muted-foreground">Abrir no aplicativo</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </Button>

          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-muted-foreground mb-3">Navegação Interna</p>
            
            <Button
              variant="default"
              className="w-full justify-start gap-3 h-14"
              onClick={handleInternalNavigation}
              data-testid="button-nav-internal"
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary-foreground/20">
                {isMobile ? (
                  <Smartphone className="h-5 w-5" />
                ) : (
                  <MapPinned className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium">Navegar na Plataforma</p>
                <p className="text-xs opacity-80">
                  {isMobile ? 'Navegação ponto a ponto' : 'Ver rota no mapa'}
                </p>
              </div>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

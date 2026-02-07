import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Navigation, 
  MapPin, 
  Check, 
  X, 
  Lock, 
  FileText,
  ChevronRight,
  Map,
  Search,
  Plus,
  Undo2,
  ClipboardList,
  Crosshair,
  Home,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AddressSearch } from '@/components/address';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useItineraryStore, usePreferencesStore, useLocationStore, useAuthStore } from '@/lib/stores';
import { useOfflineStore } from '@/lib/offlineStore';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn, getNavigationUrl, playSound, formatCurrency } from '@/lib/utils';
import { RouteMap } from '@/components/map';
import { NavigationModal } from '@/components/NavigationModal';
import type { Stop } from '@shared/schema';

type PanelState = 'minimized' | 'half' | 'expanded';

export function DrivePage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const stops = useItineraryStore((s) => s.stops);
  const setStops = useItineraryStore((s) => s.setStops);
  const getEarnings = useItineraryStore((s) => s.getEarnings);
  const preferredNavApp = usePreferencesStore((s) => s.preferredNavApp);
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  const subscription = useAuthStore((s) => s.subscription);
  
  const { isOnline, addToQueue } = useOfflineSync();
  const offlineStops = useOfflineStore((s) => s.stops);
  const setOfflineStops = useOfflineStore((s) => s.setStops);
  const updateOfflineStop = useOfflineStore((s) => s.updateStop);
  
  const [panelState, setPanelState] = useState<PanelState>('half');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartHeight, setDragStartHeight] = useState(0);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [selectedDeliveredStop, setSelectedDeliveredStop] = useState<Stop | null>(null);
  const [selectedMapStop, setSelectedMapStop] = useState<Stop | null>(null);
  const [confirmDeliveryStop, setConfirmDeliveryStop] = useState<Stop | null>(null);
  const [confirmFailStop, setConfirmFailStop] = useState<Stop | null>(null);
  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [deliveredPackageCount, setDeliveredPackageCount] = useState<string>('');
  const [packageCountError, setPackageCountError] = useState<string>('');
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [navigationTargetStop, setNavigationTargetStop] = useState<Stop | null>(null);
  const [isInternalNavigating, setIsInternalNavigating] = useState(false);
  const [navigatingToStopId, setNavigatingToStopId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { request: requestWakeLock, release: releaseWakeLock, isActive: isWakeLockActive } = useWakeLock();

  useEffect(() => {
    requestWakeLock();
    return () => {
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);
  
  const canAccessFinancials = subscription?.canAccessFinancials !== false;

  const { data: stopsData, isLoading } = useQuery<Stop[]>({
    queryKey: ['/api/stops'],
    refetchOnWindowFocus: true,
    refetchInterval: isOnline ? 10000 : false,
    staleTime: 5000,
    enabled: isOnline,
  });

  const { data: settings } = useQuery<{ 
    earningPerDelivery: number; 
    sundayBonusThreshold: number; 
    sundayBonusValue: number;
    startAddress?: string;
    startLatitude?: number;
    startLongitude?: number;
  }>({
    queryKey: ['/api/settings'],
    staleTime: 60000,
  });
  
  const earningPerDelivery = settings?.earningPerDelivery ?? 2.80;
  
  const startPoint = settings?.startAddress && settings?.startLatitude && settings?.startLongitude
    ? {
        address: settings.startAddress,
        latitude: settings.startLatitude,
        longitude: settings.startLongitude,
      }
    : null;

  useEffect(() => {
    if (stopsData && stopsData.length > 0) {
      setStops(stopsData);
      setOfflineStops(stopsData);
    }
  }, [stopsData, setStops, setOfflineStops]);

  useEffect(() => {
    if (!isOnline && offlineStops.length > 0 && stops.length === 0) {
      setStops(offlineStops);
    }
  }, [isOnline, offlineStops, stops.length, setStops]);

  const updateStopLocally = useCallback((id: string, newStatus: string) => {
    const currentStops = [...stops];
    const stopIndex = currentStops.findIndex(s => s.id === id);
    if (stopIndex === -1) return;

    const updatedStops = currentStops.map(stop => {
      if (stop.id === id) {
        return { ...stop, status: newStatus as Stop['status'] };
      }
      return stop;
    });

    if (newStatus === 'delivered' || newStatus === 'failed') {
      const sortedBySequence = [...updatedStops].sort((a, b) => 
        (a.sequenceOrder || 0) - (b.sequenceOrder || 0)
      );
      const nextPending = sortedBySequence.find(s => s.status === 'pending');
      if (nextPending) {
        const nextPendingIndex = updatedStops.findIndex(s => s.id === nextPending.id);
        if (nextPendingIndex !== -1) {
          updatedStops[nextPendingIndex] = { 
            ...updatedStops[nextPendingIndex], 
            status: 'current' as Stop['status'] 
          };
        }
      }
    }

    setStops(updatedStops);
    setOfflineStops(updatedStops);
  }, [stops, setStops, setOfflineStops]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, previousStatus, deliveredCount }: { id: string; status: string; previousStatus?: string; deliveredCount?: number }) => {
      console.log('[OPTIROTA DEBUG] ========================================');
      console.log('[OPTIROTA DEBUG] updateStatusMutation INICIADO');
      console.log('[OPTIROTA DEBUG] Stop ID:', id);
      console.log('[OPTIROTA DEBUG] Novo status:', status);
      console.log('[OPTIROTA DEBUG] Status anterior:', previousStatus);
      console.log('[OPTIROTA DEBUG] Delivered count:', deliveredCount);
      console.log('[OPTIROTA DEBUG] isOnline:', isOnline);
      console.log('[OPTIROTA DEBUG] ========================================');
      
      if (!isOnline) {
        console.log('[OPTIROTA DEBUG] MODO OFFLINE - Salvando localmente');
        updateStopLocally(id, status);
        addToQueue({
          type: 'update_stop_status',
          endpoint: `/api/stops/${id}/status`,
          method: 'PATCH',
          body: { status, deliveredCount },
        });
        console.log('[OPTIROTA DEBUG] Adicionado à fila offline');
        return { offline: true, id, status, deliveredCount };
      }
      
      console.log('[OPTIROTA DEBUG] MODO ONLINE - Enviando para API');
      console.log('[OPTIROTA DEBUG] Endpoint:', `/api/stops/${id}/status`);
      console.log('[OPTIROTA DEBUG] Body:', JSON.stringify({ status, deliveredCount }));
      
      try {
        const response = await apiRequest('PATCH', `/api/stops/${id}/status`, { status, deliveredCount });
        console.log('[OPTIROTA DEBUG] Response status:', response.status);
        console.log('[OPTIROTA DEBUG] Response ok:', response.ok);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[OPTIROTA DEBUG] ERRO na resposta:', errorText);
          throw new Error(`API Error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('[OPTIROTA DEBUG] Response data:', JSON.stringify(data));
        console.log('[OPTIROTA DEBUG] ========================================');
        return data;
      } catch (error) {
        console.error('[OPTIROTA DEBUG] ERRO na requisição:', error);
        console.error('[OPTIROTA DEBUG] Error message:', error instanceof Error ? error.message : String(error));
        console.error('[OPTIROTA DEBUG] ========================================');
        throw error;
      }
    },
    onSuccess: (result, variables) => {
      if (result?.offline) {
        if (variables.status === 'delivered') {
          if (soundEnabled) playSound('success');
          const count = variables.deliveredCount || 1;
          toast({ 
            title: 'Entrega confirmada (offline)',
            description: `+${formatCurrency(earningPerDelivery * count)} (${count} pacote${count > 1 ? 's' : ''}) - será sincronizado`,
          });
        } else if (variables.status === 'failed') {
          if (soundEnabled) playSound('error');
          toast({ 
            title: 'Marcado como falha (offline)',
            description: 'Será sincronizado quando a internet voltar',
            variant: 'destructive',
          });
        } else if (variables.status === 'pending') {
          toast({ 
            title: 'Status desfeito (offline)',
            description: 'Será sincronizado quando a internet voltar',
          });
          setSelectedDeliveredStop(null);
        }
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/cycle'] });
      
      if (variables.status === 'delivered') {
        if (soundEnabled) playSound('success');
        const count = variables.deliveredCount || 1;
        toast({ 
          title: 'Entrega confirmada!',
          description: `+${formatCurrency(earningPerDelivery * count)}${count > 1 ? ` (${count} pacotes)` : ''}`,
        });
      } else if (variables.status === 'failed') {
        if (soundEnabled) playSound('error');
        toast({ 
          title: 'Entrega marcada como falha',
          variant: 'destructive',
        });
      } else if (variables.status === 'pending') {
        const wasDelivered = variables.previousStatus === 'delivered';
        toast({ 
          title: wasDelivered ? 'Entrega desfeita' : 'Falha desfeita',
          description: wasDelivered ? `-${formatCurrency(earningPerDelivery)}` : 'Status voltou para pendente',
        });
        setSelectedDeliveredStop(null);
      }
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/itinerary/finalize', {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      queryClient.invalidateQueries({ queryKey: ['/api/itinerary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      setStops([]);
      if (soundEnabled) playSound('success');
      toast({ 
        title: 'Rota finalizada!',
        description: `${data.summary?.name}: ${data.summary?.deliveredCount} entregas - ${formatCurrency(data.summary?.earnings || 0)}`,
      });
      navigate('/plan');
    },
    onError: () => {
      toast({ 
        title: 'Erro ao finalizar rota',
        variant: 'destructive',
      });
    },
  });

  const setCurrentMutation = useMutation({
    mutationFn: async (stopId: string) => {
      const response = await apiRequest('POST', `/api/stops/${stopId}/set-current`, {});
      return { stopId, data: await response.json() };
    },
    onSuccess: ({ stopId }) => {
      // Atualizar estado local imediatamente para refletir a mudança
      const updatedStops = stops.map(stop => {
        if (stop.id === stopId) {
          return { ...stop, status: 'current' as Stop['status'] };
        }
        // Reset any other 'current' stop to 'pending'
        if (stop.status === 'current') {
          return { ...stop, status: 'pending' as Stop['status'] };
        }
        return stop;
      });
      setStops(updatedStops);
      setOfflineStops(updatedStops);
      
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      setSelectedMapStop(null);
      toast({ 
        title: 'Parada selecionada como atual',
        description: 'Voce pode navegar para esta entrega agora',
      });
    },
    onError: (error: Error) => {
      console.error('[DEBUG SET-CURRENT] Erro no frontend:', error);
      toast({ 
        title: 'Erro ao selecionar parada',
        description: error.message || 'Verifique sua conexão',
        variant: 'destructive',
      });
    },
  });

  const addStopMutation = useMutation({
    mutationFn: async (data: { address: string; latitude: number; longitude: number }) => {
      const response = await apiRequest('POST', '/api/stops', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      setShowAddStopModal(false);
      toast({ 
        title: 'Parada adicionada!',
        description: 'Nova entrega foi adicionada ao final da rota',
      });
    },
    onError: () => {
      toast({ 
        title: 'Erro ao adicionar parada',
        variant: 'destructive',
      });
    },
  });

  const handleAddressSelect = (address: string, latitude: number, longitude: number) => {
    addStopMutation.mutate({ address, latitude, longitude });
  };

  const handleMapStopClick = (stop: Stop) => {
    if (stop.status === 'delivered' || stop.status === 'failed') {
      setSelectedDeliveredStop(stop);
    } else if (stop.status === 'pending') {
      setSelectedMapStop(stop);
    }
  };

  const confirmSetCurrent = () => {
    if (selectedMapStop) {
      setCurrentMutation.mutate(selectedMapStop.id);
    }
  };

  // Sort stops by sequenceOrder to ensure correct navigation order
  const sortedStops = [...stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  
  // Find current stop:
  // 1. PRIORITY: If a stop was manually selected (status === 'current'), use it
  // 2. FALLBACK: Use first pending stop in sequence order
  const completedStops = sortedStops.filter((s) => s.status === 'delivered' || s.status === 'failed');
  const pendingStops = sortedStops.filter((s) => s.status === 'pending' || s.status === 'current');
  
  // First check for manually selected stop (status === 'current')
  const manuallySelectedStop = sortedStops.find((s) => s.status === 'current');
  // Fallback to first pending stop
  const firstPendingStop = sortedStops.find((s) => s.status === 'pending');
  // Current stop is manually selected OR first pending
  const currentStop = manuallySelectedStop || firstPendingStop;
  const currentIndex = currentStop ? sortedStops.findIndex(s => s.id === currentStop.id) + 1 : 0;
  const earnings = getEarnings();

  const getPanelHeight = useCallback(() => {
    switch (panelState) {
      case 'minimized': return '40px';
      case 'half': return '35vh';
      case 'expanded': return 'calc(100vh - 4rem - 56px - 180px)';
    }
  }, [panelState]);

  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    setIsDragging(true);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStartY(clientY);
    setDragStartHeight(panelRef.current?.offsetHeight || 0);
  };

  const handleDragMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!isDragging) return;
    
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const deltaY = dragStartY - clientY;
    const newHeight = dragStartHeight + deltaY;
    const windowHeight = window.innerHeight - 64 - 60;
    
    if (newHeight < 180) {
      setPanelState('minimized');
    } else if (newHeight > windowHeight * 0.7) {
      setPanelState('expanded');
    } else {
      setPanelState('half');
    }
  }, [isDragging, dragStartY, dragStartHeight]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  const handleNavigate = (stop: Stop) => {
    setNavigationTargetStop(stop);
    setShowNavigationModal(true);
  };

  const handleStartInternalNavigation = (stop: Stop) => {
    setIsInternalNavigating(true);
    setNavigatingToStopId(stop.id);
    toast({
      title: 'Navegação iniciada',
      description: `Siga até: ${stop.addressFull.split(',')[0]}`,
    });
  };

  const handleStopInternalNavigation = () => {
    setIsInternalNavigating(false);
    setNavigatingToStopId(null);
  };

  const handleConfirmDelivery = (stop: Stop) => {
    setConfirmDeliveryStop(stop);
  };

  const handleFailDelivery = (stop: Stop) => {
    setConfirmFailStop(stop);
  };

  const executeDelivery = () => {
    console.log('[OPTIROTA DEBUG] ========================================');
    console.log('[OPTIROTA DEBUG] executeDelivery() CLICADO');
    console.log('[OPTIROTA DEBUG] confirmDeliveryStop:', confirmDeliveryStop ? JSON.stringify({
      id: confirmDeliveryStop.id,
      address: confirmDeliveryStop.addressFull?.substring(0, 50),
      status: confirmDeliveryStop.status,
      packageCount: confirmDeliveryStop.packageCount
    }) : 'null');
    console.log('[OPTIROTA DEBUG] ========================================');
    
    if (confirmDeliveryStop) {
      const totalPackages = confirmDeliveryStop.packageCount || 1;
      console.log('[OPTIROTA DEBUG] Total de pacotes:', totalPackages);
      
      // Se tem mais de 1 pacote, validar a quantidade informada
      if (totalPackages > 1) {
        const count = parseInt(deliveredPackageCount, 10);
        console.log('[OPTIROTA DEBUG] Quantidade informada:', deliveredPackageCount, '-> parsed:', count);
        if (isNaN(count) || count < 1) {
          console.log('[OPTIROTA DEBUG] ERRO: Quantidade inválida');
          setPackageCountError('Digite uma quantidade válida');
          return;
        }
        if (count > totalPackages) {
          console.log('[OPTIROTA DEBUG] ERRO: Quantidade maior que total');
          setPackageCountError(`Quantidade inválida. Máximo: ${totalPackages} pacotes`);
          return;
        }
        console.log('[OPTIROTA DEBUG] Chamando updateStatusMutation.mutate() com deliveredCount:', count);
        updateStatusMutation.mutate({ 
          id: confirmDeliveryStop.id, 
          status: 'delivered',
          deliveredCount: count
        });
      } else {
        console.log('[OPTIROTA DEBUG] Chamando updateStatusMutation.mutate() com deliveredCount: 1');
        updateStatusMutation.mutate({ 
          id: confirmDeliveryStop.id, 
          status: 'delivered',
          deliveredCount: 1
        });
      }
      
      setConfirmDeliveryStop(null);
      setDeliveredPackageCount('');
      setPackageCountError('');
    } else {
      console.log('[OPTIROTA DEBUG] ERRO: confirmDeliveryStop é null');
    }
  };

  const executeFail = () => {
    console.log('[OPTIROTA DEBUG] ========================================');
    console.log('[OPTIROTA DEBUG] executeFail() CLICADO');
    console.log('[OPTIROTA DEBUG] confirmFailStop:', confirmFailStop ? JSON.stringify({
      id: confirmFailStop.id,
      address: confirmFailStop.addressFull?.substring(0, 50),
      status: confirmFailStop.status
    }) : 'null');
    console.log('[OPTIROTA DEBUG] ========================================');
    
    if (confirmFailStop) {
      console.log('[OPTIROTA DEBUG] Chamando updateStatusMutation.mutate() com status: failed');
      updateStatusMutation.mutate({ id: confirmFailStop.id, status: 'failed' });
      setConfirmFailStop(null);
    } else {
      console.log('[OPTIROTA DEBUG] ERRO: confirmFailStop é null');
    }
  };

  const handleUndoDelivery = (id: string, previousStatus: string) => {
    updateStatusMutation.mutate({ id, status: 'pending', previousStatus });
  };

  const handleStopClick = (stop: Stop) => {
    if (stop.status === 'delivered') {
      setSelectedDeliveredStop(stop);
    }
  };

  const deliveredStops = stops.filter((s) => s.status === 'delivered');

  const formatTime = () => {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const getNeighborhood = (address: string) => {
    const parts = address.split(',');
    if (parts.length >= 2) {
      return parts.slice(1, 3).join(',').trim();
    }
    return address;
  };

  const estimatedTime = pendingStops.length * 3;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (stops.length === 0) {
    return (
      <div className="relative h-[calc(100vh-4rem)] overflow-hidden">
        <RouteMap 
          stops={[]} 
          startPoint={startPoint}
          className="absolute inset-0 w-full h-full"
          data-testid="map-drive"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20" style={{ zIndex: 1000 }}>
          <Card className="max-w-sm mx-4 shadow-xl">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <MapPin className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-2">
                Nenhuma entrega planejada
              </h3>
              <p className="text-sm text-muted-foreground text-center">
                Adicione endereços na aba Planejar
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!currentStop) {
    return (
      <div className="relative h-[calc(100vh-4rem)] overflow-hidden">
        <RouteMap 
          stops={stops} 
          startPoint={startPoint}
          onStopClick={handleMapStopClick}
          className="absolute inset-0 w-full h-full"
          data-testid="map-route"
        />
        <div 
          className="absolute bottom-0 left-0 right-0 z-[1000] bg-background rounded-t-2xl shadow-2xl p-6"
          style={{ marginBottom: '56px' }}
        >
          <div className="text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-chart-2 text-chart-2-foreground mx-auto mb-4">
              <Check className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2" data-testid="text-all-completed">
              Todas as entregas concluídas!
            </h3>
            <p className="text-muted-foreground mb-4" data-testid="text-completed-count">
              Você completou {completedStops.length} entregas hoje
            </p>
            {canAccessFinancials ? (
              <p className="text-3xl font-bold text-chart-2 mb-4" data-testid="text-total-earnings">
                {formatCurrency(earnings.total)}
              </p>
            ) : (
              <p className="flex items-center justify-center gap-2 text-2xl font-bold text-muted-foreground mb-4" data-testid="text-earnings-blocked">
                <Lock className="h-5 w-5" />
                R$ ***
              </p>
            )}
            <div className="flex flex-col gap-3">
              {completedStops.length > 0 && (
                <Button 
                  onClick={() => setShowVerifyDialog(true)}
                  variant="outline"
                  className="gap-2"
                  data-testid="button-verify-routes"
                >
                  <ClipboardList className="h-4 w-4" />
                  Verificar Rotas ({completedStops.length})
                </Button>
              )}
              <Button 
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending}
                className="gap-2 bg-chart-2 hover:bg-chart-2/90"
                data-testid="button-finalize-route"
              >
                <Check className="h-4 w-4" />
                {finalizeMutation.isPending ? 'Finalizando...' : 'Finalizar Rota'}
              </Button>
              <Button 
                onClick={() => navigate('/plan')}
                variant="outline"
                className="gap-2"
                data-testid="button-create-new-route"
              >
                <Plus className="h-4 w-4" />
                Nova Rota
              </Button>
            </div>
          </div>
        </div>

        <Dialog open={!!selectedDeliveredStop} onOpenChange={() => setSelectedDeliveredStop(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Desfazer {selectedDeliveredStop?.status === 'delivered' ? 'Entrega' : 'Falha'}</DialogTitle>
              <DialogDescription>
                {selectedDeliveredStop?.status === 'delivered' 
                  ? `Deseja desfazer esta entrega? O valor de ${formatCurrency(earningPerDelivery)} sera subtraido dos ganhos.`
                  : 'Deseja desfazer esta falha? A parada voltara para pendente.'}
              </DialogDescription>
            </DialogHeader>
            {selectedDeliveredStop && (
              <div className="space-y-4">
                <div className={cn(
                  "p-3 rounded-lg",
                  selectedDeliveredStop.status === 'delivered' ? "bg-chart-2/10" : "bg-destructive/10"
                )}>
                  <p className="font-medium">{selectedDeliveredStop.addressFull.split(',')[0]}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-muted-foreground">{selectedDeliveredStop.fixedIdentifier}</p>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded",
                      selectedDeliveredStop.status === 'delivered' 
                        ? "bg-chart-2/20 text-chart-2" 
                        : "bg-destructive/20 text-destructive"
                    )}>
                      {selectedDeliveredStop.status === 'delivered' ? 'Entregue' : 'Falha'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setSelectedDeliveredStop(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 gap-2"
                    onClick={() => handleUndoDelivery(selectedDeliveredStop.id, selectedDeliveredStop.status)}
                    disabled={updateStatusMutation.isPending}
                  >
                    <Undo2 className="h-4 w-4" />
                    Desfazer
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
          <DialogContent className="sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Verificar Rotas</DialogTitle>
              <DialogDescription>
                Revise todas as rotas. Clique em uma para desfazer.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-2">
              {completedStops.map((stop, index) => (
                <div 
                  key={stop.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg cursor-pointer",
                    stop.status === 'delivered' 
                      ? "bg-chart-2/10 hover:bg-chart-2/20" 
                      : "bg-destructive/10 hover:bg-destructive/20"
                  )}
                  onClick={() => {
                    setShowVerifyDialog(false);
                    setSelectedDeliveredStop(stop);
                  }}
                >
                  <div className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold",
                    stop.status === 'delivered' 
                      ? "bg-chart-2 text-chart-2-foreground" 
                      : "bg-destructive text-destructive-foreground"
                  )}>
                    {stop.status === 'delivered' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{stop.addressFull.split(',')[0]}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">{stop.fixedIdentifier}</p>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        stop.status === 'delivered' 
                          ? "bg-chart-2/20 text-chart-2" 
                          : "bg-destructive/20 text-destructive"
                      )}>
                        {stop.status === 'delivered' ? 'Entregue' : 'Falha'}
                      </span>
                    </div>
                  </div>
                  <Undo2 className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
            <div className="pt-4 border-t space-y-1">
              <p className="text-sm text-muted-foreground text-center">
                Entregues: {deliveredStops.length} = {formatCurrency(deliveredStops.length * earningPerDelivery)}
              </p>
              <p className="text-sm text-muted-foreground text-center">
                Falhas: {completedStops.filter(s => s.status === 'failed').length}
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] overflow-hidden">
      <RouteMap 
        stops={stops} 
        startPoint={startPoint}
        onStopClick={handleMapStopClick}
        className="absolute inset-0 w-full h-full"
        navigatingToStopId={navigatingToStopId}
        showAllRoutes={true}
        data-testid="map-route"
      />
      
      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg flex items-center gap-2" data-testid="badge-current-time">
        <Map className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium" data-testid="text-current-time">{formatTime()}</span>
      </div>

      {isInternalNavigating && (
        <div className="absolute top-4 left-4 bg-chart-2/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-3" data-testid="badge-navigating">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-white rounded-full animate-pulse" />
            <span className="text-sm font-medium text-white">Navegando...</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStopInternalNavigation}
            className="h-7 px-2 text-white hover:bg-white/20"
            data-testid="button-stop-navigation"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div 
        ref={panelRef}
        className="absolute left-0 right-0 bg-background rounded-t-2xl shadow-2xl transition-all duration-300 ease-out flex flex-col"
        style={{ 
          bottom: 'calc(56px + 160px)',
          height: getPanelHeight(),
          maxHeight: 'calc(100vh - 4rem - 56px - 160px)',
          zIndex: 1000
        }}
        data-testid="panel-overlay"
      >
        <div 
          className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          data-testid="panel-drag-handle"
        >
          <div className="flex justify-center py-3">
            <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
          </div>
        </div>

        {panelState !== 'minimized' && (
          <>
            <div className="flex-1 overflow-y-auto px-4 space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Término: {formatTime()}</span>
                <span className="text-muted-foreground/50">•</span>
                <span>{pendingStops.length} paradas</span>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" data-testid="button-search-stop">
                  <Search className="h-5 w-5" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowAddStopModal(true)}
                  className="gap-1"
                  data-testid="button-add-stop"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              </div>

              <div className="space-y-2" data-testid="list-stops">
                {sortedStops.map((stop, index) => {
                  const isCurrentStop = stop.id === currentStop?.id;
                  const isCompleted = stop.status === 'delivered' || stop.status === 'failed';
                  const isDelivered = stop.status === 'delivered';
                  const isPending = stop.status === 'pending';
                  
                  return (
                    <div 
                      key={stop.id}
                      onClick={() => {
                        if (isDelivered) handleStopClick(stop);
                        else if (isPending && !isCurrentStop) setSelectedMapStop(stop);
                      }}
                      className={cn(
                        "flex items-start gap-3 py-3 px-2 rounded-lg",
                        isCurrentStop && "bg-primary/5 border border-primary/20",
                        isCompleted && "opacity-50",
                        (isDelivered || isPending) && "cursor-pointer hover:bg-muted/50"
                      )}
                      data-testid={`stop-item-${stop.id}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div 
                          className={cn(
                            "flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold",
                            stop.status === 'delivered' ? 'bg-chart-2 text-chart-2-foreground' :
                            stop.status === 'failed' ? 'bg-destructive text-destructive-foreground' :
                            isCurrentStop ? 'bg-primary text-primary-foreground' :
                            'bg-muted text-muted-foreground'
                          )}
                          data-testid={`badge-stop-${stop.id}`}
                        >
                          {stop.status === 'delivered' ? <Check className="h-4 w-4" /> :
                           stop.status === 'failed' ? <X className="h-4 w-4" /> :
                           index + 1}
                        </div>
                        {index < stops.length - 1 && (
                          <div className="w-0.5 h-8 bg-muted-foreground/20" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "font-medium",
                          isCompleted && "line-through"
                        )} data-testid={`text-stop-address-${stop.id}`}>
                          {stop.addressFull.split(',')[0]}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {getNeighborhood(stop.addressFull)}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 text-xs bg-muted rounded" data-testid={`text-stop-identifier-${stop.id}`}>
                            {stop.fixedIdentifier}
                          </span>
                          {(stop.packageCount || 1) > 1 && (
                            <span className="px-1.5 py-0.5 bg-primary/20 text-primary rounded text-xs font-medium">
                              {stop.packageCount} pacotes
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm text-muted-foreground" data-testid={`text-stop-time-${stop.id}`}>
                          {formatTime()}
                        </span>
                        {isPending && !isCurrentStop && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMapStop(stop);
                            }}
                            className="p-1 rounded hover:bg-primary/20 text-primary"
                            title="Selecionar como próxima"
                          >
                            <Crosshair className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </>
        )}
      </div>

      {/* Barra de ações FIXA na parte inferior - sempre visível */}
      <div 
        className="fixed left-0 right-0 bg-background border-t shadow-lg"
        style={{ 
          bottom: '56px',
          zIndex: 1001
        }}
        data-testid="panel-actions-fixed"
      >
        <div className="p-3 space-y-2">
          {/* Info da entrega atual */}
          <div className="flex items-center justify-between">
            <span className="text-primary font-bold text-lg" data-testid="text-estimated-time">
              {estimatedTime}min
            </span>
            <span className="text-sm text-muted-foreground">
              {pendingStops.length} paradas restantes
            </span>
          </div>
          
          {/* Endereço atual */}
          <div className="flex items-start justify-between gap-2 py-2 border-y border-muted">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {currentStop.addressFull.split(',')[0]}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {currentStop.addressFull.split(',').slice(1, 3).join(',').trim()}
              </p>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-0.5 rounded">
                {currentStop.fixedIdentifier}
              </span>
              {(currentStop.packageCount || 1) > 1 && (
                <span className="text-xs text-muted-foreground mt-1">
                  {currentStop.packageCount} pacotes
                </span>
              )}
            </div>
          </div>
          
          {/* Botões de ação */}
          <div className="grid grid-cols-3 gap-2">
            <Button 
              onClick={() => handleNavigate(currentStop)}
              size="lg"
              className="flex-col gap-1"
              data-testid="button-navigate"
            >
              <Navigation className="h-5 w-5" />
              <span className="text-xs">Navegar</span>
            </Button>
            
            <Button 
              variant="destructive"
              onClick={() => handleFailDelivery(currentStop)}
              size="lg"
              className="flex-col gap-1"
              disabled={updateStatusMutation.isPending}
              data-testid="button-fail-delivery"
            >
              <X className="h-5 w-5" />
              <span className="text-xs">Não entregue</span>
            </Button>
            
            <Button 
              variant="secondary"
              onClick={() => handleConfirmDelivery(currentStop)}
              size="lg"
              className="flex-col gap-1 bg-chart-2 text-chart-2-foreground dark:bg-chart-2 dark:text-chart-2-foreground border-chart-2"
              disabled={updateStatusMutation.isPending}
              data-testid="button-confirm-delivery"
            >
              <Check className="h-5 w-5" />
              <span className="text-xs">Entregue</span>
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedDeliveredStop} onOpenChange={() => setSelectedDeliveredStop(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desfazer {selectedDeliveredStop?.status === 'delivered' ? 'Entrega' : 'Falha'}</DialogTitle>
            <DialogDescription>
              {selectedDeliveredStop?.status === 'delivered' 
                ? `Deseja desfazer esta entrega? O valor de ${formatCurrency(2.80)} sera subtraido dos ganhos.`
                : 'Deseja desfazer esta falha? A parada voltara para pendente.'}
            </DialogDescription>
          </DialogHeader>
          {selectedDeliveredStop && (
            <div className="space-y-4">
              <div className={cn(
                "p-3 rounded-lg",
                selectedDeliveredStop.status === 'delivered' ? "bg-chart-2/10" : "bg-destructive/10"
              )}>
                <p className="font-medium">{selectedDeliveredStop.addressFull.split(',')[0]}</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm text-muted-foreground">{selectedDeliveredStop.fixedIdentifier}</p>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded",
                    selectedDeliveredStop.status === 'delivered' 
                      ? "bg-chart-2/20 text-chart-2" 
                      : "bg-destructive/20 text-destructive"
                  )}>
                    {selectedDeliveredStop.status === 'delivered' ? 'Entregue' : 'Falha'}
                  </span>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedDeliveredStop(null)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 gap-2"
                  onClick={() => handleUndoDelivery(selectedDeliveredStop.id, selectedDeliveredStop.status)}
                  disabled={updateStatusMutation.isPending}
                >
                  <Undo2 className="h-4 w-4" />
                  Desfazer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Verificar Rotas</DialogTitle>
            <DialogDescription>
              Revise todas as rotas. Clique em uma para desfazer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2">
            {completedStops.map((stop, index) => (
              <div 
                key={stop.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg cursor-pointer",
                  stop.status === 'delivered' 
                    ? "bg-chart-2/10 hover:bg-chart-2/20" 
                    : "bg-destructive/10 hover:bg-destructive/20"
                )}
                onClick={() => {
                  setShowVerifyDialog(false);
                  setSelectedDeliveredStop(stop);
                }}
              >
                <div className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold",
                  stop.status === 'delivered' 
                    ? "bg-chart-2 text-chart-2-foreground" 
                    : "bg-destructive text-destructive-foreground"
                )}>
                  {stop.status === 'delivered' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{stop.addressFull.split(',')[0]}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">{stop.fixedIdentifier}</p>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded",
                      stop.status === 'delivered' 
                        ? "bg-chart-2/20 text-chart-2" 
                        : "bg-destructive/20 text-destructive"
                    )}>
                      {stop.status === 'delivered' ? 'Entregue' : 'Falha'}
                    </span>
                  </div>
                </div>
                <Undo2 className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
          <div className="pt-4 border-t space-y-1">
            <p className="text-sm text-muted-foreground text-center">
              Entregues: {deliveredStops.length} = {formatCurrency(deliveredStops.length * earningPerDelivery)}
            </p>
            <p className="text-sm text-muted-foreground text-center">
              Falhas: {completedStops.filter(s => s.status === 'failed').length}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedMapStop} onOpenChange={() => setSelectedMapStop(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ir para esta entrega?</DialogTitle>
            <DialogDescription>
              Voce quer selecionar esta parada como a atual e pular a sequencia normal?
            </DialogDescription>
          </DialogHeader>
          {selectedMapStop && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{selectedMapStop.addressFull.split(',')[0]}</p>
                <p className="text-sm text-muted-foreground">{selectedMapStop.fixedIdentifier}</p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedMapStop(null)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={confirmSetCurrent}
                  disabled={setCurrentMutation.isPending}
                >
                  {setCurrentMutation.isPending ? 'Selecionando...' : 'Ir para esta'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeliveryStop} onOpenChange={() => setConfirmDeliveryStop(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-chart-2" />
              Confirmar Entrega
            </DialogTitle>
            <DialogDescription>
              Confirme os dados do pacote antes de marcar como entregue.
            </DialogDescription>
          </DialogHeader>
          {confirmDeliveryStop && (
            <div className="space-y-4">
              <div className="p-4 bg-chart-2/10 rounded-lg border border-chart-2/20">
                <p className="font-semibold text-lg">{confirmDeliveryStop.addressFull.split(',')[0]}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {confirmDeliveryStop.addressFull.split(',').slice(1).join(',').trim()}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="px-2 py-1 text-sm bg-muted rounded font-medium">
                    {confirmDeliveryStop.fixedIdentifier}
                  </span>
                  {(confirmDeliveryStop.packageCount || 1) > 1 && (
                    <span className="px-2 py-1 bg-primary/20 text-primary rounded text-sm font-medium">
                      {confirmDeliveryStop.packageCount} pacotes
                    </span>
                  )}
                </div>
              </div>
              
              {(confirmDeliveryStop.packageCount || 1) > 1 ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Quantos pacotes foram entregues? (Total: {confirmDeliveryStop.packageCount})
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max={confirmDeliveryStop.packageCount}
                    value={deliveredPackageCount}
                    onChange={(e) => {
                      setDeliveredPackageCount(e.target.value);
                      setPackageCountError('');
                    }}
                    placeholder={`Digite de 1 a ${confirmDeliveryStop.packageCount}`}
                    className="text-center text-lg"
                    data-testid="input-delivered-package-count"
                  />
                  {packageCountError && (
                    <p className="text-sm text-destructive">{packageCountError}</p>
                  )}
                  <div className="text-center text-sm text-muted-foreground">
                    Valor: <span className="font-semibold text-chart-2">
                      +{formatCurrency(earningPerDelivery * (parseInt(deliveredPackageCount, 10) || 0))}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  Valor: <span className="font-semibold text-chart-2">+{formatCurrency(earningPerDelivery)}</span>
                </div>
              )}
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setConfirmDeliveryStop(null);
                    setDeliveredPackageCount('');
                    setPackageCountError('');
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 gap-2 bg-chart-2 hover:bg-chart-2/90 text-chart-2-foreground"
                  onClick={executeDelivery}
                  disabled={updateStatusMutation.isPending}
                >
                  <Check className="h-4 w-4" />
                  {updateStatusMutation.isPending ? 'Confirmando...' : 'Confirmar Entrega'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmFailStop} onOpenChange={() => setConfirmFailStop(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-destructive" />
              Confirmar Falha na Entrega
            </DialogTitle>
            <DialogDescription>
              Confirme os dados do pacote antes de marcar como não entregue.
            </DialogDescription>
          </DialogHeader>
          {confirmFailStop && (
            <div className="space-y-4">
              <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <p className="font-semibold text-lg">{confirmFailStop.addressFull.split(',')[0]}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {confirmFailStop.addressFull.split(',').slice(1).join(',').trim()}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="px-2 py-1 text-sm bg-muted rounded font-medium">
                    {confirmFailStop.fixedIdentifier}
                  </span>
                  {(confirmFailStop.packageCount || 1) > 1 && (
                    <span className="px-2 py-1 bg-primary/20 text-primary rounded text-sm font-medium">
                      {confirmFailStop.packageCount} pacotes
                    </span>
                  )}
                </div>
              </div>
              <div className="text-center text-sm text-muted-foreground">
                Este pacote sera marcado como <span className="font-semibold text-destructive">não entregue</span>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmFailStop(null)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 gap-2"
                  onClick={executeFail}
                  disabled={updateStatusMutation.isPending}
                >
                  <X className="h-4 w-4" />
                  {updateStatusMutation.isPending ? 'Confirmando...' : 'Confirmar Falha'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {showAddStopModal && (
        <div 
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50" 
          onClick={() => setShowAddStopModal(false)}
          data-testid="modal-overlay-add-stop"
        >
          <div 
            className="bg-background rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Adicionar Nova Parada</h3>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowAddStopModal(false)}
                data-testid="button-close-add-stop"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              A nova parada será adicionada ao final da rota atual.
            </p>
            <AddressSearch
              onAddressSelect={handleAddressSelect}
              isLoading={addStopMutation.isPending}
              placeholder="Digite o endereço..."
            />
          </div>
        </div>
      )}

      <NavigationModal
        open={showNavigationModal}
        onOpenChange={setShowNavigationModal}
        stop={navigationTargetStop}
        onStartInternalNavigation={handleStartInternalNavigation}
      />
    </div>
  );
}

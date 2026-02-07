import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Search, 
  Plus, 
  Calendar, 
  Navigation, 
  Home, 
  Clock, 
  MapPin,
  Share2,
  Truck,
  Coffee,
  ChevronRight,
  ArrowRightLeft,
  Hand,
  X,
  Route,
  Package,
  GripVertical,
  Trash2,
  ChevronUp,
  ChevronDown,
  Minus,
  History,
  CheckCircle2,
  Pencil,
  Settings2,
  LayoutGrid,
  Footprints
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useItineraryStore, useLocationStore } from '@/lib/stores';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { RouteMap } from '@/components/map';
import { AddressSearch } from '@/components/address';
import { useLocation } from 'wouter';
import type { Stop, Itinerary } from '@shared/schema';

function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function getWeekdayName(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return weekdays[date.getDay()];
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h${mins.toString().padStart(2, '0')}min`;
  }
  return `${mins}min`;
}

type PanelState = 'minimized' | 'half' | 'expanded';

export function PlanPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const stops = useItineraryStore((s) => s.stops);
  const setStops = useItineraryStore((s) => s.setStops);
  const userLocation = useLocationStore((s) => s.currentLocation);
  const setLocation = useLocationStore((s) => s.setLocation);
  const setWatching = useLocationStore((s) => s.setWatching);
  
  // Monitora GPS continuamente para atualizar a rota no mapa
  useEffect(() => {
    if (!navigator.geolocation) return;
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setWatching(true);
      },
      (error) => {
        console.warn('Erro ao obter localização:', error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    
    return () => {
      navigator.geolocation.clearWatch(watchId);
      setWatching(false);
    };
  }, [setLocation, setWatching]);
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [showOptimizingModal, setShowOptimizingModal] = useState(false);
  const [showStartAddressModal, setShowStartAddressModal] = useState(false);
  const [routeDate, setRouteDate] = useState(getTodayDateString());
  const [routeName, setRouteName] = useState('');
  const [homeAddress, setHomeAddress] = useState<{ address: string; lat: number; lng: number } | null>(null);
  const [editingStop, setEditingStop] = useState<Stop | null>(null);
  const [editedAddressText, setEditedAddressText] = useState('');
  const [editMode, setEditMode] = useState<'manual' | 'search'>('manual');
  const [duplicateStop, setDuplicateStop] = useState<Stop | null>(null);
  const [pendingAddress, setPendingAddress] = useState<{ address: string; latitude: number; longitude: number } | null>(null);
  const [startAddressInput, setStartAddressInput] = useState<{ address: string; latitude: number; longitude: number } | null>(null);
  const [selectedHistoryRoute, setSelectedHistoryRoute] = useState<Itinerary | null>(null);
  const [historyStops, setHistoryStops] = useState<Stop[]>([]);
  const [loadingHistoryStops, setLoadingHistoryStops] = useState(false);
  
  // Sector drawing mode states
  const [sectorDrawingMode, setSectorDrawingMode] = useState(false);
  const [isActivelyDrawing, setIsActivelyDrawing] = useState(false);
  const [drawnSectors, setDrawnSectors] = useState<Array<{ points: Array<{ lat: number; lng: number }>; stopIds: string[] }>>([]);
  
  const [panelState, setPanelState] = useState<PanelState>('half');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartHeight, setDragStartHeight] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: itineraryData, isLoading: isLoadingItinerary, refetch: refetchItinerary } = useQuery<{ itinerary: Itinerary | null }>({
    queryKey: ['/api/itinerary'],
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const activeItinerary = itineraryData?.itinerary;

  const { data: stopsData, isLoading: isLoadingStops, refetch } = useQuery<Stop[]>({
    queryKey: ['/api/stops'],
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    staleTime: 5000,
    enabled: !!activeItinerary,
  });

  // Query para histórico de rotas finalizadas
  const { data: historyData } = useQuery<{ itineraries: Itinerary[] }>({
    queryKey: ['/api/itinerary/history'],
    staleTime: 60000,
  });

  const completedRoutes = historyData?.itineraries || [];

  // Function to load stops for a history route
  const loadHistoryStops = async (route: Itinerary) => {
    setSelectedHistoryRoute(route);
    setLoadingHistoryStops(true);
    setHistoryStops([]);
    try {
      const response = await fetch(`/api/itinerary/${route.id}/stops`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setHistoryStops(data.stops || []);
      } else {
        toast({ title: 'Erro ao carregar endereços', variant: 'destructive' });
        setSelectedHistoryRoute(null);
      }
    } catch (error) {
      console.error('Error loading history stops:', error);
      toast({ title: 'Erro ao carregar endereços', variant: 'destructive' });
      setHistoryStops([]);
      setSelectedHistoryRoute(null);
    } finally {
      setLoadingHistoryStops(false);
    }
  };

  // Query para buscar configurações (endereço inicial)
  const { data: settingsData, refetch: refetchSettings } = useQuery<{
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

  const configuredStartAddress = settingsData?.startAddress;
  const settingsLoaded = settingsData !== undefined;
  
  const startPoint = settingsData?.startAddress && settingsData?.startLatitude && settingsData?.startLongitude
    ? {
        address: settingsData.startAddress,
        latitude: settingsData.startLatitude,
        longitude: settingsData.startLongitude,
      }
    : null;

  // Mostrar modal obrigatório se ponto de partida não estiver configurado
  useEffect(() => {
    if (settingsLoaded && !configuredStartAddress) {
      setShowStartAddressModal(true);
    }
  }, [settingsLoaded, configuredStartAddress]);

  useEffect(() => {
    if (stopsData) {
      setStops(stopsData);
    } else if (!activeItinerary) {
      setStops([]);
    }
  }, [stopsData, activeItinerary, setStops]);

  const getPanelHeight = useCallback(() => {
    switch (panelState) {
      case 'minimized': return '140px';
      case 'half': return '50vh';
      case 'expanded': return 'calc(100vh - 4rem - 60px)';
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
    
    if (newHeight < 150) {
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

  const togglePanel = () => {
    if (panelState === 'minimized') {
      setPanelState('half');
    } else if (panelState === 'half') {
      setPanelState('expanded');
    } else {
      setPanelState('minimized');
    }
  };

  const createItineraryMutation = useMutation({
    mutationFn: async (data: { date: string; name?: string }) => {
      const response = await apiRequest('POST', '/api/itinerary', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/itinerary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      refetchItinerary();
      setShowCreateForm(false);
      setRouteName('');
      toast({ title: 'Rota criada!' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar rota', variant: 'destructive' });
    },
  });

  const addStopMutation = useMutation({
    mutationFn: async (data: { address: string; latitude: number; longitude: number }) => {
      const response = await apiRequest('POST', '/api/stops', {
        addressFull: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      refetch();
      toast({ title: 'Endereço adicionado!' });
    },
    onError: () => {
      toast({ title: 'Erro ao adicionar endereço', variant: 'destructive' });
    },
  });

  const updateStopMutation = useMutation({
    mutationFn: async (data: { id: string; addressFull: string; latitude: number; longitude: number }) => {
      const response = await apiRequest('PATCH', `/api/stops/${data.id}`, {
        addressFull: data.addressFull,
        latitude: data.latitude,
        longitude: data.longitude,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      refetch();
      setEditingStop(null);
      toast({ title: 'Endereço atualizado!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar endereço', variant: 'destructive' });
    },
  });

  const updateStartAddressMutation = useMutation({
    mutationFn: async (data: { startAddress: string; startLatitude: number; startLongitude: number }) => {
      const currentSettings = settingsData || {
        earningPerDelivery: 2.80,
        sundayBonusThreshold: 50,
        sundayBonusValue: 100,
      };
      const response = await apiRequest('PATCH', '/api/settings', {
        ...currentSettings,
        startAddress: data.startAddress,
        startLatitude: data.startLatitude,
        startLongitude: data.startLongitude,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      refetchSettings();
      setShowStartAddressModal(false);
      setStartAddressInput(null);
      toast({ title: 'Endereço inicial configurado!' });
    },
    onError: () => {
      toast({ title: 'Erro ao configurar endereço', variant: 'destructive' });
    },
  });

  const deleteStopMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/stops/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      refetch();
      toast({ title: 'Parada removida!' });
    },
    onError: () => {
      toast({ title: 'Erro ao remover parada', variant: 'destructive' });
    },
  });

  const handleEditAddress = (address: string, latitude: number, longitude: number) => {
    if (!editingStop) return;
    updateStopMutation.mutate({
      id: editingStop.id,
      addressFull: address,
      latitude,
      longitude,
    });
  };

  const handleManualEditSave = () => {
    if (!editingStop || !editedAddressText.trim()) return;
    updateStopMutation.mutate({
      id: editingStop.id,
      addressFull: editedAddressText.trim(),
      latitude: editingStop.latitude,
      longitude: editingStop.longitude,
    });
  };

  const openEditDialog = (stop: Stop) => {
    setEditingStop(stop);
    setEditedAddressText(stop.addressFull);
    setEditMode('manual');
  };

  const optimizeMutation = useMutation({
    mutationFn: async (location?: { latitude: number; longitude: number }) => {
      const response = await apiRequest('POST', '/api/stops/optimize', location || {});
      return response.json();
    },
    onSuccess: (data) => {
      setStops(data.stops || []);
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      setShowOptimizingModal(false);
      toast({ title: 'Rota otimizada!', description: 'Ordenado do mais próximo ao mais distante' });
    },
    onError: () => {
      setShowOptimizingModal(false);
      toast({ title: 'Erro ao otimizar', variant: 'destructive' });
    },
  });

  const handleOptimize = () => {
    setShowOptimizingModal(true);
    setShowRefineModal(false);
    
    // Captura GPS em tempo real antes de otimizar
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          console.log('GPS capturado:', latitude, longitude);
          optimizeMutation.mutate({ latitude, longitude });
        },
        (error) => {
          console.warn('Erro ao capturar GPS:', error.message);
          // Se falhar, usa localização armazenada ou otimiza sem GPS
          if (userLocation) {
            optimizeMutation.mutate({
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            });
          } else {
            toast({ 
              title: 'GPS indisponível',
              description: 'Otimizando sem localização atual',
              variant: 'destructive'
            });
            optimizeMutation.mutate(undefined);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else if (userLocation) {
      optimizeMutation.mutate({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      });
    } else {
      optimizeMutation.mutate(undefined);
    }
  };

  const reorderMutation = useMutation({
    mutationFn: async (stopIds: string[]) => {
      const response = await apiRequest('POST', '/api/stops/reorder', { stopIds });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.stops) {
        setStops(data.stops);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
    },
    onError: () => {
      toast({ title: 'Erro ao reordenar rota', variant: 'destructive' });
    },
  });

  const handleReverseRoute = () => {
    // Get reversed order of stop IDs
    const reversedIds = [...stops].reverse().map(stop => stop.id);
    
    // Update local state immediately for UI feedback
    const reversed = [...stops].reverse().map((stop, index) => ({
      ...stop,
      sequenceOrder: index + 1,
    }));
    setStops(reversed);
    setShowRefineModal(false);
    
    // Save to server
    reorderMutation.mutate(reversedIds);
    toast({ title: 'Rota invertida!' });
  };

  const extractStreetName = (address: string): string => {
    const parts = address.split(',');
    if (parts.length > 0) {
      const streetPart = parts[0].trim();
      const streetOnly = streetPart.replace(/\s*\d+\s*$/, '').trim();
      return streetOnly.toLowerCase()
        .replace(/^(rua|avenida|av\.|r\.|alameda|al\.|travessa|tv\.|rodovia|estrada|praça)\s*/i, '')
        .trim();
    }
    return address.toLowerCase();
  };

  const extractHouseNumber = (address: string): number => {
    const commaMatch = address.match(/,\s*(\d+)/);
    if (commaMatch) {
      return parseInt(commaMatch[1]);
    }
    
    const parts = address.split(',');
    if (parts.length > 0) {
      const streetPart = parts[0].trim();
      const trailingNum = streetPart.match(/\s(\d+)\s*$/);
      if (trailingNum) {
        return parseInt(trailingNum[1]);
      }
    }
    
    const allNumbers = address.match(/\d+/g);
    if (allNumbers && allNumbers.length > 0) {
      return parseInt(allNumbers[allNumbers.length - 1]);
    }
    
    return 0;
  };

  const handleOptimizeByStreet = () => {
    if (stops.length < 2) {
      toast({ title: 'Adicione pelo menos 2 paradas para otimizar' });
      return;
    }

    setShowRefineModal(false);

    const streetGroups: { [key: string]: Stop[] } = {};
    stops.forEach(stop => {
      const streetName = extractStreetName(stop.addressFull);
      if (!streetGroups[streetName]) {
        streetGroups[streetName] = [];
      }
      streetGroups[streetName].push(stop);
    });

    Object.keys(streetGroups).forEach(street => {
      streetGroups[street].sort((a, b) => {
        const numA = extractHouseNumber(a.addressFull);
        const numB = extractHouseNumber(b.addressFull);
        return numA - numB;
      });
    });

    const userLat = userLocation?.latitude || stops[0]?.latitude || 0;
    const userLng = userLocation?.longitude || stops[0]?.longitude || 0;

    const streetCenters = Object.keys(streetGroups).map(street => {
      const stopsOnStreet = streetGroups[street];
      const centerLat = stopsOnStreet.reduce((sum, s) => sum + s.latitude, 0) / stopsOnStreet.length;
      const centerLng = stopsOnStreet.reduce((sum, s) => sum + s.longitude, 0) / stopsOnStreet.length;
      const distanceToUser = Math.sqrt(
        Math.pow(centerLat - userLat, 2) + Math.pow(centerLng - userLng, 2)
      );
      return { street, center: { lat: centerLat, lng: centerLng }, distance: distanceToUser };
    });

    streetCenters.sort((a, b) => a.distance - b.distance);

    const optimizedStops: Stop[] = [];
    streetCenters.forEach(({ street }) => {
      optimizedStops.push(...streetGroups[street]);
    });

    const reorderedStops = optimizedStops.map((stop, index) => ({
      ...stop,
      sequenceOrder: index + 1,
    }));

    setStops(reorderedStops);
    reorderMutation.mutate(reorderedStops.map(s => s.id));
    toast({ title: 'Rota otimizada por rua!', description: 'Entregas agrupadas por rua para evitar voltas' });
  };

  // Manual sector ordering functions
  const handleStartManualOrder = () => {
    if (stops.length < 2) {
      toast({ title: 'Adicione pelo menos 2 paradas para ordenar' });
      return;
    }
    setShowRefineModal(false);
    setDrawnSectors([]);
    setSectorDrawingMode(true);
  };

  const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Point-in-polygon detection using ray casting algorithm
  const isPointInPolygon = (point: { lat: number; lng: number }, polygon: Array<{ lat: number; lng: number }>): boolean => {
    let inside = false;
    const x = point.lng;
    const y = point.lat;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    return inside;
  };

  const handleSectorComplete = (points: Array<{ lat: number; lng: number }>) => {
    // Find stops inside this sector that aren't already in another sector
    const usedStopIds = new Set(drawnSectors.flatMap(s => s.stopIds));
    const stopsInSector = stops.filter(stop => {
      if (usedStopIds.has(stop.id)) return false;
      return isPointInPolygon({ lat: stop.latitude, lng: stop.longitude }, points);
    });

    if (stopsInSector.length === 0) {
      toast({ title: 'Nenhuma parada selecionada', description: 'Desenhe uma área que inclua pelo menos uma parada' });
      setIsActivelyDrawing(false);
      return;
    }

    const newSector = {
      points,
      stopIds: stopsInSector.map(s => s.id),
    };

    setDrawnSectors([...drawnSectors, newSector]);
    setIsActivelyDrawing(false);
    toast({ title: `Setor ${drawnSectors.length + 1} criado!`, description: `${stopsInSector.length} parada${stopsInSector.length !== 1 ? 's' : ''} selecionada${stopsInSector.length !== 1 ? 's' : ''}` });
  };

  const handleUndoLastSector = () => {
    if (drawnSectors.length > 0) {
      setDrawnSectors(drawnSectors.slice(0, -1));
    }
  };

  const handleApplySectorOrder = () => {
    // Get stops in sector order, then add any remaining stops at the end
    const orderedStopIds: string[] = [];
    drawnSectors.forEach(sector => {
      orderedStopIds.push(...sector.stopIds);
    });

    // Add any stops not in any sector at the end
    const remainingStops = stops.filter(s => !orderedStopIds.includes(s.id));
    remainingStops.forEach(s => orderedStopIds.push(s.id));

    // Reorder stops
    const reorderedStops = orderedStopIds.map((id, index) => {
      const stop = stops.find(s => s.id === id)!;
      return { ...stop, sequenceOrder: index + 1 };
    });

    setStops(reorderedStops);
    reorderMutation.mutate(orderedStopIds);
    setSectorDrawingMode(false);
    setDrawnSectors([]);
    toast({ title: 'Rota reordenada!', description: `${drawnSectors.length} setor(es) definido(s)` });
  };

  const handleCancelSectorDrawing = () => {
    setSectorDrawingMode(false);
    setIsActivelyDrawing(false);
    setDrawnSectors([]);
  };

  const addPackageMutation = useMutation({
    mutationFn: async (stopId: string) => {
      const response = await apiRequest('POST', `/api/stops/${stopId}/add-package`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      refetch();
      setDuplicateStop(null);
      setPendingAddress(null);
      toast({ title: 'Pacote adicionado!', description: 'Mais um pacote neste endereço' });
    },
    onError: () => {
      toast({ title: 'Erro ao adicionar pacote', variant: 'destructive' });
    },
  });

  const handleAddressSelect = async (address: string, latitude: number, longitude: number) => {
    try {
      const response = await apiRequest('POST', '/api/stops/check-duplicate', { latitude, longitude });
      const data = await response.json();
      
      if (data.exists && data.stop) {
        setDuplicateStop(data.stop);
        setPendingAddress({ address, latitude, longitude });
      } else {
        addStopMutation.mutate({ address, latitude, longitude });
      }
    } catch {
      addStopMutation.mutate({ address, latitude, longitude });
    }
  };

  const handleAddNewStop = () => {
    if (pendingAddress) {
      addStopMutation.mutate(pendingAddress);
      setDuplicateStop(null);
      setPendingAddress(null);
    }
  };

  const handleAddPackageToExisting = () => {
    if (duplicateStop) {
      addPackageMutation.mutate(duplicateStop.id);
    }
  };

  const handleCreateRoute = () => {
    createItineraryMutation.mutate({
      date: routeDate,
      name: routeName.trim() || undefined,
    });
  };

  const startRouteMutation = useMutation({
    mutationFn: async () => {
      const firstPendingStop = stops.find(s => s.status === 'pending');
      if (firstPendingStop) {
        const response = await apiRequest('POST', `/api/stops/${firstPendingStop.id}/set-current`, {});
        return response.json();
      }
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      navigate('/drive');
    },
    onError: () => {
      toast({ title: 'Erro ao iniciar rota', variant: 'destructive' });
    },
  });

  const handleStartRoute = () => {
    const hasCurrentStop = stops.some(s => s.status === 'current');
    if (hasCurrentStop) {
      navigate('/drive');
    } else {
      startRouteMutation.mutate();
    }
  };

  const allStopsCompleted = stops.length > 0 && stops.every(
    stop => stop.status === 'delivered' || stop.status === 'failed'
  );

  const hasPendingStops = stops.some(
    stop => stop.status === 'pending' || stop.status === 'current'
  );

  // Verifica se a rota foi iniciada (algum stop não está mais 'pending')
  const isRouteStarted = stops.some(
    stop => stop.status === 'current' || stop.status === 'delivered' || stop.status === 'failed'
  );

  // Verifica se a rota atual está finalizada (status='completed')
  const isRouteFinalized = activeItinerary?.status === 'completed';

  // Mutation para criar nova rota após finalizar (reseta contador)
  const createNewRouteMutation = useMutation({
    mutationFn: async (data: { date: string; name?: string }) => {
      const response = await apiRequest('POST', '/api/itinerary/new', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/itinerary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      refetchItinerary();
      setShowCreateForm(false);
      setRouteName('');
      toast({ title: 'Nova rota criada!', description: 'Contador de pacotes resetado para 1' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar nova rota', variant: 'destructive' });
    },
  });

  // Mutation para finalizar a rota antes de criar nova
  const finalizeRouteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/itinerary/finalize');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/itinerary'] });
      refetchItinerary();
    },
  });

  const handleFinishAndCreateNew = async () => {
    // Se a rota não está finalizada mas todas as entregas estão concluídas, finaliza primeiro
    if (!isRouteFinalized && allStopsCompleted) {
      try {
        await finalizeRouteMutation.mutateAsync();
      } catch (error) {
        console.error('Error finalizing route:', error);
      }
    }
    setRouteDate(getTodayDateString());
    setShowCreateForm(true);
  };

  const handleCreateNewRoute = () => {
    // Usa o novo endpoint que reseta o contador
    createNewRouteMutation.mutate({
      date: routeDate,
      name: routeName.trim() || undefined,
    });
  };

  const estimatedTime = stops.length * 3;
  const estimatedDistance = stops.length * 0.5;

  if (isLoadingItinerary) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Mostrar formulário de criar nova rota após finalização ou todas entregas concluídas
  if ((isRouteFinalized || allStopsCompleted || !activeItinerary) && showCreateForm) {
    const isCreatingNew = isRouteFinalized || allStopsCompleted;
    const mutation = isCreatingNew ? createNewRouteMutation : createItineraryMutation;
    const handleSubmit = isCreatingNew ? handleCreateNewRoute : handleCreateRoute;
    
    return (
      <div className="relative h-[calc(100vh-4rem)] overflow-hidden">
        <RouteMap 
          stops={stops} 
          startPoint={startPoint}
          className="absolute inset-0 w-full h-full"
          data-testid="map-plan"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-4" style={{ zIndex: 1000 }}>
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                {isCreatingNew ? 'Criar Nova Rota' : 'Nova Rota'}
              </CardTitle>
              <CardDescription>
                {isCreatingNew 
                  ? 'A rota anterior foi salva no histórico. Configure sua nova rota (pacotes começam do 1).'
                  : 'Configure a data e nome da sua rota de entregas'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="route-date">Data da Rota</Label>
                <Input
                  id="route-date"
                  type="date"
                  value={routeDate}
                  onChange={(e) => setRouteDate(e.target.value)}
                  data-testid="input-route-date"
                />
                <p className="text-xs text-muted-foreground">
                  {formatDisplayDate(routeDate)} - {getWeekdayName(routeDate)}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="route-name">Nome da Rota (opcional)</Label>
                <Input
                  id="route-name"
                  type="text"
                  placeholder={`${getWeekdayName(routeDate)} Rota`}
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  data-testid="input-route-name"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setRouteName('');
                    setRouteDate(getTodayDateString());
                  }}
                  className="flex-1"
                  data-testid="button-cancel-route"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={mutation.isPending}
                  className="flex-1"
                  data-testid="button-save-route"
                >
                  {mutation.isPending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    isCreatingNew ? 'Criar Nova Rota' : 'Criar Rota'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Estado: Rota finalizada - bloquear funções, mostrar botão de criar nova
  if (isRouteFinalized && !showCreateForm) {
    const deliveredCount = stops.filter(s => s.status === 'delivered').length;
    const failedCount = stops.filter(s => s.status === 'failed').length;
    
    return (
      <div className="relative h-[calc(100vh-4rem)] overflow-hidden">
        <RouteMap 
          stops={stops} 
          startPoint={startPoint}
          className="absolute inset-0 w-full h-full"
          data-testid="map-plan"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20" style={{ zIndex: 1000 }}>
          <Card className="max-w-sm mx-4 shadow-xl">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mb-4">
                <Package className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="font-semibold text-lg text-foreground mb-2">Rota Finalizada!</h3>
              <p className="text-sm text-muted-foreground text-center max-w-64 mb-2">
                {deliveredCount} entrega(s) concluída(s)
                {failedCount > 0 && `, ${failedCount} falha(s)`}
              </p>
              <p className="text-xs text-muted-foreground text-center max-w-64 mb-6">
                Rota salva no histórico: {activeItinerary?.name}
              </p>
              <Button 
                onClick={() => {
                  setRouteDate(getTodayDateString());
                  setShowCreateForm(true);
                }}
                className="gap-2"
                data-testid="button-create-new-route"
              >
                <Plus className="h-4 w-4" />
                Criar Nova Rota
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!activeItinerary && !showCreateForm) {
    return (
      <div className="relative h-[calc(100vh-4rem)] overflow-hidden">
        <RouteMap 
          stops={[]} 
          startPoint={startPoint}
          className="absolute inset-0 w-full h-full"
          data-testid="map-plan"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-start pt-8 bg-black/20 overflow-y-auto pb-20" style={{ zIndex: 1000 }}>
          <Card className="max-w-sm mx-4 shadow-xl mb-4">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
                <Route className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg text-foreground mb-2">Criar Nova Rota</h3>
              <p className="text-sm text-muted-foreground text-center max-w-64 mb-6">
                Comece criando uma rota para adicionar seus endereços de entrega
              </p>
              <Button 
                onClick={() => setShowCreateForm(true)}
                className="gap-2"
                data-testid="button-create-route"
              >
                <Plus className="h-4 w-4" />
                Criar Rota
              </Button>
            </CardContent>
          </Card>

          {completedRoutes.length > 0 && (
            <Card className="max-w-sm mx-4 shadow-xl w-full">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-5 w-5 text-primary" />
                  Histórico de Rotas
                </CardTitle>
                <CardDescription>
                  Suas rotas finalizadas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {completedRoutes.slice(0, 5).map((route) => (
                  <div 
                    key={route.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => loadHistoryStops(route)}
                    data-testid={`history-route-${route.id}`}
                  >
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{route.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDisplayDate(route.date)} • R$ {(route.totalEarnings || 0).toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (!activeItinerary && showCreateForm) {
    return (
      <div className="relative h-[calc(100vh-4rem)] overflow-hidden">
        <RouteMap 
          stops={[]} 
          startPoint={startPoint}
          className="absolute inset-0 w-full h-full"
          data-testid="map-plan"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-4" style={{ zIndex: 1000 }}>
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Nova Rota
              </CardTitle>
              <CardDescription>
                Configure a data e nome da sua rota de entregas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="route-date">Data da Rota</Label>
                <Input
                  id="route-date"
                  type="date"
                  value={routeDate}
                  onChange={(e) => setRouteDate(e.target.value)}
                  data-testid="input-route-date"
                />
                <p className="text-xs text-muted-foreground">
                  {formatDisplayDate(routeDate)} - {getWeekdayName(routeDate)}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="route-name">Nome da Rota (opcional)</Label>
                <Input
                  id="route-name"
                  type="text"
                  placeholder={`${getWeekdayName(routeDate)} Rota`}
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  data-testid="input-route-name"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
                    setRouteName('');
                    setRouteDate(getTodayDateString());
                  }}
                  className="flex-1"
                  data-testid="button-cancel-route"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateRoute}
                  disabled={createItineraryMutation.isPending}
                  className="flex-1"
                  data-testid="button-save-route"
                >
                  {createItineraryMutation.isPending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    'Criar Rota'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] overflow-hidden">
      <RouteMap 
        stops={stops} 
        startPoint={startPoint}
        className="absolute inset-0 w-full h-full"
        drawnSectors={sectorDrawingMode ? drawnSectors : undefined}
        sectorDrawingMode={isActivelyDrawing}
        onSectorDrawn={handleSectorComplete}
        data-testid="map-plan"
      />
      
      {/* Close button for sector drawing mode */}
      {sectorDrawingMode && (
        <div className="absolute top-4 left-4 z-[600]">
          <Button
            variant="secondary"
            size="icon"
            className="bg-background shadow-lg"
            onClick={handleCancelSectorDrawing}
            data-testid="button-cancel-sector-drawing"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Drawing instruction overlay on main map */}
      {sectorDrawingMode && isActivelyDrawing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
          <div className="bg-background/90 backdrop-blur-sm rounded-xl px-6 py-4 shadow-lg text-center">
            <Pencil className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="font-medium">Desenhe uma área</p>
            <p className="text-sm text-muted-foreground">Toque e desenhe ao redor das paradas do setor {drawnSectors.length + 1}</p>
          </div>
        </div>
      )}

      {/* Sector badges on main map */}
      {sectorDrawingMode && drawnSectors.map((sector, index) => (
        <div
          key={index}
          className="absolute z-[500] pointer-events-none"
          style={{
            left: '50%',
            top: `${70 + index * 40}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex items-center gap-2 bg-background/90 backdrop-blur-sm rounded-full px-3 py-1 shadow-lg">
            <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-sm font-bold">
              {index + 1}
            </div>
            <span className="text-sm font-medium">{sector.stopIds.length} parada{sector.stopIds.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      ))}

      <div 
        ref={panelRef}
        className="absolute left-0 right-0 bg-background rounded-t-2xl shadow-2xl transition-all duration-300 ease-out flex flex-col"
        style={{ 
          bottom: '56px',
          height: getPanelHeight(),
          maxHeight: 'calc(100vh - 4rem - 56px)',
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

        {panelState === 'minimized' ? (
          <div className="flex-1 px-4 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-primary font-bold text-xl" data-testid="text-estimated-time">
                {formatDuration(estimatedTime)}
              </span>
              <span className="text-muted-foreground text-sm">
                • {stops.length} paradas • {estimatedDistance.toFixed(1)} km
              </span>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setShowRefineModal(true)}
                data-testid="button-refine"
              >
                Refinar
              </Button>
              <Button 
                className="flex-1"
                onClick={handleStartRoute}
                disabled={stops.length === 0}
                data-testid="button-start-route"
              >
                Iniciar rota
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 space-y-3">
              <div className="relative">
                <AddressSearch
                  onAddressSelect={handleAddressSelect}
                  isLoading={addStopMutation.isPending}
                  placeholder="Adicione ou busque"
                  disabled={isRouteFinalized || allStopsCompleted}
                />
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-route-stats">
                <Clock className="h-4 w-4" />
                <span data-testid="text-route-duration">{formatDuration(estimatedTime)}</span>
                <span className="text-muted-foreground/50">•</span>
                <span data-testid="text-route-stops">{stops.length} paradas</span>
                <span className="text-muted-foreground/50">•</span>
                <span data-testid="text-route-distance">{estimatedDistance.toFixed(1)} km</span>
              </div>

              <h2 className="font-semibold text-lg" data-testid="text-route-name">
                {formatDisplayDate(activeItinerary?.date || getTodayDateString())} - {getWeekdayName(activeItinerary?.date || getTodayDateString())}
              </h2>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2" size="sm" data-testid="button-share-route">
                  <Share2 className="h-4 w-4" />
                  <span className="text-sm">Compartilhar rota</span>
                </Button>
                <Button variant="outline" className="flex-1 gap-2" size="sm" data-testid="button-load-vehicle">
                  <Truck className="h-4 w-4" />
                  <span className="text-sm">Carregar veículo</span>
                </Button>
              </div>

              <button 
                className="flex items-center justify-between w-full py-3 border-t hover-elevate rounded-lg"
                onClick={() => setShowStartAddressModal(true)}
                data-testid="button-configure-start-address"
              >
                <div className="flex items-center gap-3">
                  <Settings2 className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="font-medium text-sm">
                      {configuredStartAddress ? 'Ponto de partida configurado' : 'Configurar ponto de partida'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                      {configuredStartAddress || 'Defina o endereço inicial para otimização da rota'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>

              <button 
                className="flex items-center justify-between w-full py-3 border-t hover-elevate rounded-lg"
                onClick={() => {}}
                data-testid="button-schedule-pause"
              >
                <div className="flex items-center gap-3">
                  <Coffee className="h-5 w-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="font-medium text-sm">Sem pausa</p>
                    <p className="text-xs text-muted-foreground">Toque para agendar uma pausa</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>

              {stops.length > 0 && (
                <div className="border-t" data-testid="list-stops">
                  {stops.map((stop, index) => (
                    <div 
                      key={stop.id}
                      className="flex items-start gap-2 py-2 px-1 border-b last:border-b-0 hover-elevate"
                      data-testid={`stop-item-${stop.id}`}
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab mt-1 flex-shrink-0" />
                      <div 
                        className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold flex-shrink-0 mt-0.5 ${
                          stop.status === 'current' ? 'bg-chart-2 text-chart-2-foreground dark:bg-chart-2 dark:text-chart-2-foreground' :
                          stop.status === 'delivered' ? 'bg-muted text-muted-foreground' :
                          stop.status === 'failed' ? 'bg-destructive text-destructive-foreground' :
                          'bg-primary text-primary-foreground'
                        }`}
                        data-testid={`badge-stop-${stop.id}`}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-tight" data-testid={`text-stop-address-${stop.id}`}>
                          {stop.addressFull}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[10px] text-muted-foreground" data-testid={`text-stop-identifier-${stop.id}`}>
                            {stop.fixedIdentifier}
                          </p>
                          {(stop.packageCount || 1) > 1 && (
                            <span className="px-1 py-0 bg-primary/20 text-primary rounded text-[10px] font-medium">
                              {stop.packageCount} pac
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => openEditDialog(stop)}
                          disabled={stop.status === 'delivered' || stop.status === 'failed'}
                          data-testid={`button-edit-stop-${stop.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => deleteStopMutation.mutate(stop.id)}
                          disabled={deleteStopMutation.isPending || stop.status === 'delivered' || stop.status === 'failed'}
                          data-testid={`button-delete-stop-${stop.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {homeAddress && (
                <button 
                  className="flex items-center justify-between w-full py-3 border-t hover-elevate rounded-lg"
                  data-testid="button-home-address"
                >
                  <div className="flex items-center gap-3">
                    <Home className="h-5 w-5 text-primary" />
                    <span className="text-sm" data-testid="text-home-address">{homeAddress.address}</span>
                  </div>
                  <span className="text-sm text-muted-foreground" data-testid="text-home-time">
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
              )}
            </div>

            <div className="flex-shrink-0 p-4 border-t bg-background shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              {sectorDrawingMode ? (
                <div className="space-y-3">
                  {drawnSectors.length > 0 && !isActivelyDrawing && (
                    <button
                      className="flex items-center gap-3 w-full text-left"
                      onClick={handleUndoLastSector}
                      data-testid="button-undo-sector"
                    >
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <History className="h-5 w-5" />
                      </div>
                      <span>Desfazer</span>
                    </button>
                  )}
                  
                  {!isActivelyDrawing && (
                    <Button
                      variant="outline"
                      className="w-full h-12"
                      onClick={() => setIsActivelyDrawing(true)}
                      data-testid="button-draw-next-group"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      {drawnSectors.length === 0 ? 'Desenhar o grupo seguinte' : 'Desenhar o grupo seguinte'}
                    </Button>
                  )}

                  {isActivelyDrawing && (
                    <Button
                      variant="outline"
                      className="w-full h-12"
                      onClick={() => setIsActivelyDrawing(false)}
                      data-testid="button-cancel-drawing"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar desenho
                    </Button>
                  )}

                  <Button
                    className="w-full h-12"
                    onClick={handleApplySectorOrder}
                    disabled={drawnSectors.length === 0 || isActivelyDrawing}
                    data-testid="button-reoptimize-route"
                  >
                    Reotimizar rota
                  </Button>
                </div>
              ) : allStopsCompleted ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-center">
                    <p className="text-sm text-muted-foreground">Todas as entregas finalizadas!</p>
                  </div>
                  <Button 
                    className="flex-1 gap-2"
                    onClick={handleFinishAndCreateNew}
                    data-testid="button-create-new-route"
                  >
                    <Plus className="h-4 w-4" />
                    Criar Nova Rota
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-primary font-bold text-xl" data-testid="text-estimated-time">
                    {formatDuration(estimatedTime)}
                  </span>
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setShowRefineModal(true)}
                    data-testid="button-refine"
                  >
                    Refinar
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={handleStartRoute}
                    disabled={stops.length === 0}
                    data-testid="button-start-route"
                  >
                    Iniciar rota
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showRefineModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50" onClick={() => setShowRefineModal(false)} data-testid="modal-overlay-refine">
          <div 
            className="w-full max-w-md mx-4 bg-background rounded-2xl shadow-xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-lg">Refinar a rota</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowRefineModal(false)} data-testid="button-close-refine">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-2">
              <button
                className="flex items-center justify-between w-full p-4 hover-elevate rounded-lg transition-colors"
                onClick={handleReverseRoute}
                data-testid="button-reverse-route"
              >
                <div className="flex items-center gap-4">
                  <ArrowRightLeft className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">Inverter a rota</p>
                    <p className="text-sm text-muted-foreground">Inverter a direção da rota</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>

              <button
                className="flex items-center justify-between w-full p-4 hover-elevate rounded-lg transition-colors"
                onClick={handleOptimize}
                data-testid="button-optimize"
              >
                <div className="flex items-center gap-4">
                  <Hand className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">Otimizar rota</p>
                    <p className="text-sm text-muted-foreground">Ordenar do mais próximo ao mais distante</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>

              <button
                className="flex items-center justify-between w-full p-4 hover-elevate rounded-lg transition-colors"
                onClick={handleOptimizeByStreet}
                data-testid="button-optimize-by-street"
              >
                <div className="flex items-center gap-4">
                  <LayoutGrid className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">Otimizar por rua</p>
                    <p className="text-sm text-muted-foreground">Agrupar entregas da mesma rua (evita voltas)</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>

              <button
                className="flex items-center justify-between w-full p-4 hover-elevate rounded-lg transition-colors"
                onClick={handleStartManualOrder}
                data-testid="button-manual-order"
              >
                <div className="flex items-center gap-4">
                  <Pencil className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">Ordenar a rota manualmente</p>
                    <p className="text-sm text-muted-foreground">Definir a ordem da rota desenhando no mapa</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showOptimizingModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50" style={{ zIndex: 2000 }}>
          <div className="bg-background rounded-2xl shadow-xl p-8 mx-4 max-w-sm w-full text-center">
            <h3 className="font-semibold text-xl mb-6">Otimizando a rota</h3>
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="h-20 w-20 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MapPin className="h-8 w-8 text-primary animate-bounce" />
                </div>
              </div>
            </div>
            <p className="text-muted-foreground mb-4">Criando sua rota...</p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div className="bg-primary h-full rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      )}


      <Dialog open={!!editingStop} onOpenChange={() => setEditingStop(null)}>
        <DialogContent className="sm:max-w-md z-[2000]">
          <DialogHeader>
            <DialogTitle>Editar Endereco</DialogTitle>
            <DialogDescription>
              Edite o texto ou busque um novo endereco.
            </DialogDescription>
          </DialogHeader>
          {editingStop && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">{editingStop.fixedIdentifier}</p>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant={editMode === 'manual' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setEditMode('manual')}
                >
                  Editar Texto
                </Button>
                <Button
                  variant={editMode === 'search' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setEditMode('search')}
                >
                  Buscar Novo
                </Button>
              </div>

              {editMode === 'manual' ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Endereco:</label>
                    <textarea
                      value={editedAddressText}
                      onChange={(e) => setEditedAddressText(e.target.value)}
                      className="w-full p-3 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                      rows={3}
                      placeholder="Digite o endereco completo..."
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleManualEditSave}
                    disabled={updateStopMutation.isPending || !editedAddressText.trim()}
                  >
                    {updateStopMutation.isPending ? 'Salvando...' : 'Salvar Alteracao'}
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium mb-2">Buscar novo endereco:</p>
                  <AddressSearch
                    onAddressSelect={handleEditAddress}
                    isLoading={updateStopMutation.isPending}
                    placeholder="Buscar endereco..."
                  />
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setEditingStop(null)}
              >
                Cancelar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicateStop} onOpenChange={() => { setDuplicateStop(null); setPendingAddress(null); }}>
        <DialogContent className="sm:max-w-md z-[2000]">
          <DialogHeader>
            <DialogTitle>Endereço já existe</DialogTitle>
            <DialogDescription>
              Este endereço já foi adicionado na rota atual.
            </DialogDescription>
          </DialogHeader>
          {duplicateStop && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{duplicateStop.addressFull.split(',')[0]}</p>
                <p className="text-sm text-muted-foreground">{duplicateStop.fixedIdentifier}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="px-2 py-1 bg-primary/20 text-primary rounded text-sm font-medium">
                    {duplicateStop.packageCount || 1} {(duplicateStop.packageCount || 1) === 1 ? 'pacote' : 'pacotes'}
                  </span>
                </div>
              </div>
              
              <p className="text-sm text-center text-muted-foreground">
                O que deseja fazer?
              </p>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleAddPackageToExisting}
                  disabled={addPackageMutation.isPending}
                >
                  {addPackageMutation.isPending ? 'Adicionando...' : `Adicionar +1 pacote (total: ${(duplicateStop.packageCount || 1) + 1})`}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleAddNewStop}
                  disabled={addStopMutation.isPending}
                >
                  Criar nova parada mesmo assim
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setDuplicateStop(null); setPendingAddress(null); }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog 
        open={showStartAddressModal} 
        onOpenChange={(open) => {
          // Só permite fechar se já tiver ponto de partida configurado
          if (!open && !configuredStartAddress) return;
          setShowStartAddressModal(open);
        }}
      >
        <DialogContent className="sm:max-w-md z-[2000]" onInteractOutside={(e) => {
          // Impede fechar clicando fora se não tiver ponto de partida
          if (!configuredStartAddress) e.preventDefault();
        }}>
          <DialogHeader>
            <DialogTitle>
              {configuredStartAddress ? 'Ponto de Partida' : 'Configure seu Ponto de Partida'}
            </DialogTitle>
            <DialogDescription>
              {configuredStartAddress 
                ? 'Este será o ponto de partida e chegada para otimização da rota.'
                : 'Para usar o OptiRota, você precisa configurar seu ponto de partida (garagem, casa, etc). Este endereço será usado como referência para todas as suas rotas.'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {configuredStartAddress && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Endereço atual:</p>
                <p className="text-sm font-medium">{configuredStartAddress}</p>
              </div>
            )}
            
            <div>
              <p className="text-sm font-medium mb-2">Buscar novo endereço:</p>
              <AddressSearch
                onAddressSelect={(address, latitude, longitude) => {
                  setStartAddressInput({ address, latitude, longitude });
                }}
                isLoading={false}
                placeholder="Digite o endereço inicial..."
              />
            </div>

            {startAddressInput && (
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-xs text-primary mb-1">Novo endereço selecionado:</p>
                <p className="text-sm font-medium">{startAddressInput.address}</p>
              </div>
            )}

            <div className="flex gap-2">
              {configuredStartAddress && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowStartAddressModal(false);
                    setStartAddressInput(null);
                  }}
                >
                  Cancelar
                </Button>
              )}
              <Button
                className={configuredStartAddress ? "flex-1" : "w-full"}
                onClick={() => {
                  if (startAddressInput) {
                    updateStartAddressMutation.mutate({
                      startAddress: startAddressInput.address,
                      startLatitude: startAddressInput.latitude,
                      startLongitude: startAddressInput.longitude,
                    });
                  }
                }}
                disabled={!startAddressInput || updateStartAddressMutation.isPending}
              >
                {updateStartAddressMutation.isPending ? 'Salvando...' : (configuredStartAddress ? 'Salvar' : 'Confirmar e Continuar')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Route Details Modal */}
      <Dialog open={!!selectedHistoryRoute} onOpenChange={(open) => !open && setSelectedHistoryRoute(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden" data-testid="dialog-history-details">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <span data-testid="text-history-route-name">{selectedHistoryRoute?.name}</span>
            </DialogTitle>
            <DialogDescription data-testid="text-history-route-info">
              {selectedHistoryRoute && formatDisplayDate(selectedHistoryRoute.date)} • {historyStops.length} entregas
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh] space-y-2" data-testid="list-history-stops">
            {loadingHistoryStops ? (
              <div className="flex items-center justify-center py-8" data-testid="loading-history-stops">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : historyStops.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-stops">
                Nenhum endereço encontrado
              </p>
            ) : (
              historyStops.map((stop, index) => (
                <div 
                  key={stop.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                  data-testid={`history-stop-${stop.id}`}
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" data-testid={`text-stop-identifier-${stop.id}`}>{stop.fixedIdentifier || `Pacote ${index + 1}`}</p>
                    <p className="text-xs text-muted-foreground truncate" data-testid={`text-stop-address-${stop.id}`}>{stop.addressFull}</p>
                    {stop.status === 'delivered' && (
                      <span className="text-xs text-green-600" data-testid={`status-delivered-${stop.id}`}>Entregue</span>
                    )}
                    {stop.status === 'failed' && (
                      <span className="text-xs text-red-600" data-testid={`status-failed-${stop.id}`}>Não entregue</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setSelectedHistoryRoute(null)}
              data-testid="button-close-history"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

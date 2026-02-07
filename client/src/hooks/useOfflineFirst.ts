import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { offlineDB, initOfflineDB } from '@/lib/indexedDB';
import { queryClient } from '@/lib/queryClient';
import type { Stop, Itinerary } from '@shared/schema';

interface OfflineQueueItem {
  id: string;
  type: 'stop_create' | 'stop_update' | 'stop_delete' | 'stop_status' | 'itinerary_create';
  endpoint: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  data: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

export function useOfflineFirst() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isDBReady, setIsDBReady] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    initOfflineDB().then(() => {
      setIsDBReady(true);
      updatePendingCount();
      cacheAppForOffline();
    });
  }, []);

  const updatePendingCount = useCallback(async () => {
    try {
      const count = await offlineDB.getSyncQueueCount();
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  const cacheAppForOffline = useCallback(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('cacheAllAssets');
      console.log('[OfflineFirst] Requested SW to cache all assets');
    }
  }, []);

  const addToOfflineQueue = useCallback(async (item: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'retries'>) => {
    try {
      if (offlineDB.isReady()) {
        await offlineDB.addToSyncQueue({
          type: item.type,
          endpoint: item.endpoint,
          method: item.method,
          data: item.data,
        });
        console.log('[OfflineFirst] Added to queue:', item.type);
        await updatePendingCount();
      }
    } catch (error) {
      console.error('[OfflineFirst] Failed to add to queue:', error);
    }
  }, [updatePendingCount]);

  const addStop = useCallback(async (stopData: {
    id: string;
    addressFull: string;
    latitude: number;
    longitude: number;
    itineraryId: string;
    accountId: string;
    userId: string;
    sequenceOrder: number;
    packageCount: number;
    fixedIdentifier: string;
  }): Promise<Stop> => {
    const stop: Stop = {
      id: stopData.id,
      itineraryId: stopData.itineraryId,
      addressFull: stopData.addressFull,
      latitude: stopData.latitude,
      longitude: stopData.longitude,
      status: 'pending',
      sequenceOrder: stopData.sequenceOrder,
      packageCount: stopData.packageCount,
      fixedIdentifier: stopData.fixedIdentifier,
      createdAt: new Date().toISOString(),
    };

    await offlineDB.addStopLocally({ ...stop, syncStatus: 'pending' });

    if (navigator.onLine) {
      try {
        const response = await fetch('/api/stops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            addressFull: stopData.addressFull,
            latitude: stopData.latitude,
            longitude: stopData.longitude,
          }),
        });

        if (response.ok) {
          const serverStop = await response.json();
          await offlineDB.updateStop(stopData.id, { ...serverStop, syncStatus: 'synced' }, false);
          return serverStop;
        } else {
          await addToOfflineQueue({
            type: 'stop_create',
            endpoint: '/api/stops',
            method: 'POST',
            data: {
              addressFull: stopData.addressFull,
              latitude: stopData.latitude,
              longitude: stopData.longitude,
              localId: stopData.id,
            },
          });
        }
      } catch (error) {
        console.log('[OfflineFirst] Network error, queued for sync');
        await addToOfflineQueue({
          type: 'stop_create',
          endpoint: '/api/stops',
          method: 'POST',
          data: {
            addressFull: stopData.addressFull,
            latitude: stopData.latitude,
            longitude: stopData.longitude,
            localId: stopData.id,
          },
        });
      }
    } else {
      await addToOfflineQueue({
        type: 'stop_create',
        endpoint: '/api/stops',
        method: 'POST',
        data: {
          addressFull: stopData.addressFull,
          latitude: stopData.latitude,
          longitude: stopData.longitude,
          localId: stopData.id,
        },
      });
    }

    return stop;
  }, [addToOfflineQueue]);

  const updateStopStatus = useCallback(async (stopId: string, status: string, updates?: Partial<Stop>): Promise<void> => {
    const updateData = {
      status,
      ...updates,
      ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
    };

    await offlineDB.updateStop(stopId, updateData as Partial<Stop>, true);

    if (navigator.onLine) {
      try {
        const response = await fetch(`/api/stops/${stopId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status }),
        });

        if (response.ok) {
          await offlineDB.updateStop(stopId, { syncStatus: 'synced' } as unknown as Partial<Stop>, false);
        } else {
          await addToOfflineQueue({
            type: 'stop_status',
            endpoint: `/api/stops/${stopId}/status`,
            method: 'PATCH',
            data: { status },
          });
        }
      } catch {
        await addToOfflineQueue({
          type: 'stop_status',
          endpoint: `/api/stops/${stopId}/status`,
          method: 'PATCH',
          data: { status },
        });
      }
    } else {
      await addToOfflineQueue({
        type: 'stop_status',
        endpoint: `/api/stops/${stopId}/status`,
        method: 'PATCH',
        data: { status },
      });
    }
  }, [addToOfflineQueue]);

  const deleteStop = useCallback(async (stopId: string): Promise<void> => {
    await offlineDB.deleteStopLocally(stopId);

    if (navigator.onLine) {
      try {
        const response = await fetch(`/api/stops/${stopId}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (!response.ok) {
          await addToOfflineQueue({
            type: 'stop_delete',
            endpoint: `/api/stops/${stopId}`,
            method: 'DELETE',
            data: { stopId },
          });
        }
      } catch {
        await addToOfflineQueue({
          type: 'stop_delete',
          endpoint: `/api/stops/${stopId}`,
          method: 'DELETE',
          data: { stopId },
        });
      }
    } else {
      await addToOfflineQueue({
        type: 'stop_delete',
        endpoint: `/api/stops/${stopId}`,
        method: 'DELETE',
        data: { stopId },
      });
    }
  }, [addToOfflineQueue]);

  const getStops = useCallback(async (): Promise<Stop[]> => {
    if (navigator.onLine) {
      try {
        const response = await fetch('/api/stops', { credentials: 'include' });
        if (response.ok) {
          const stops = await response.json();
          await offlineDB.saveStops(stops.map((s: Stop) => ({ ...s, syncStatus: 'synced' })));
          return stops;
        }
      } catch {
        console.log('[OfflineFirst] Network error, using local data');
      }
    }

    return await offlineDB.getStops();
  }, []);

  const saveStopsLocally = useCallback(async (stops: Stop[]) => {
    try {
      await offlineDB.saveStops(stops.map(s => ({ ...s, syncStatus: 'synced' })));
      console.log('[OfflineFirst] Saved', stops.length, 'stops locally');
    } catch (error) {
      console.error('[OfflineFirst] Error saving stops:', error);
    }
  }, []);

  const saveItineraryLocally = useCallback(async (itinerary: Itinerary) => {
    try {
      await offlineDB.saveItinerary({ ...itinerary, syncStatus: 'synced' });
      console.log('[OfflineFirst] Saved itinerary locally');
    } catch (error) {
      console.error('[OfflineFirst] Error saving itinerary:', error);
    }
  }, []);

  const syncPendingOperations = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    setIsSyncing(true);
    console.log('[OfflineFirst] Starting sync...');

    try {
      const queue = await offlineDB.getSyncQueue();
      
      if (queue.length === 0) {
        setIsSyncing(false);
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const item of queue) {
        try {
          const response = await fetch(item.endpoint, {
            method: item.method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: item.method !== 'DELETE' ? JSON.stringify(item.data) : undefined,
          });

          if (response.ok || response.status === 409 || response.status === 400) {
            await offlineDB.removeFromSyncQueue(item.id);
            successCount++;
            console.log('[OfflineFirst] Synced:', item.type);
          } else if (item.retries >= 3) {
            await offlineDB.removeFromSyncQueue(item.id);
            console.log('[OfflineFirst] Max retries, removing:', item.type);
          } else {
            await offlineDB.updateSyncQueueItem(item.id, { retries: item.retries + 1 });
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
        queryClient.invalidateQueries({ queryKey: ['/api/itinerary'] });
        queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/finance/summary'] });

        toast({
          title: 'Dados sincronizados!',
          description: `${successCount} ${successCount === 1 ? 'alteracao' : 'alteracoes'} enviada(s) ao servidor.`,
        });
      }

      await updatePendingCount();
    } catch (error) {
      console.error('[OfflineFirst] Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, toast, updatePendingCount]);

  useEffect(() => {
    const handleOnline = () => {
      console.log('[OfflineFirst] Connection restored');
      setIsOnline(true);
      toast({
        title: 'Conexao restaurada',
        description: 'Sincronizando dados...',
      });
      setTimeout(syncPendingOperations, 2000);
    };

    const handleOffline = () => {
      console.log('[OfflineFirst] Connection lost');
      setIsOnline(false);
      toast({
        title: 'Modo offline',
        description: 'Suas alteracoes serao salvas localmente.',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine && isDBReady) {
      syncPendingOperations();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isDBReady, syncPendingOperations, toast]);

  useEffect(() => {
    if (!isOnline || !isDBReady) return;

    const interval = setInterval(() => {
      if (navigator.onLine) {
        updatePendingCount();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOnline, isDBReady, updatePendingCount]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    isDBReady,
    addStop,
    updateStopStatus,
    deleteStop,
    getStops,
    saveStopsLocally,
    saveItineraryLocally,
    syncPendingOperations,
    cacheAppForOffline,
  };
}

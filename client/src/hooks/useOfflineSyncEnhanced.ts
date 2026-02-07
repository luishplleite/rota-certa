import { useEffect, useState, useCallback, useRef } from 'react';
import { offlineDB, initOfflineDB } from '@/lib/indexedDB';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Stop } from '@shared/schema';

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: number | null;
}

export function useOfflineSyncEnhanced() {
  const { toast } = useToast();
  const [state, setState] = useState<SyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
  });
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (!isInitializedRef.current) {
      initOfflineDB().then(() => {
        isInitializedRef.current = true;
        checkPendingItems();
      });
    }
  }, []);

  const checkPendingItems = useCallback(async () => {
    try {
      const queue = await offlineDB.getSyncQueue();
      const pendingStops = await offlineDB.getPendingStops();
      setState(prev => ({ 
        ...prev, 
        pendingCount: queue.length + pendingStops.length 
      }));
    } catch (error) {
      console.error('Error checking pending items:', error);
    }
  }, []);

  const syncPendingData = useCallback(async () => {
    if (state.isSyncing || !state.isOnline) return;

    setState(prev => ({ ...prev, isSyncing: true }));

    try {
      const queue = await offlineDB.getSyncQueue();
      let syncedCount = 0;

      for (const item of queue) {
        try {
          switch (item.type) {
            case 'stop_status':
              await apiRequest('PATCH', `/api/stops/${item.data.stopId}/status`, {
                status: item.data.status,
              });
              break;
            case 'stop_update':
              await apiRequest('PATCH', `/api/stops/${item.data.stopId}`, item.data.updates);
              break;
            case 'stop_create':
              await apiRequest('POST', '/api/stops', item.data);
              break;
          }
          await offlineDB.removeFromSyncQueue(item.id);
          syncedCount++;
        } catch (error) {
          console.error(`Sync failed for item ${item.id}:`, error);
        }
      }

      const pendingStops = await offlineDB.getPendingStops();
      for (const stop of pendingStops) {
        await offlineDB.markStopAsSynced(stop.id);
      }

      if (syncedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
        toast({
          title: 'Sincronizado!',
          description: `${syncedCount} ${syncedCount === 1 ? 'alteração sincronizada' : 'alterações sincronizadas'}`,
        });
      }

      setState(prev => ({ 
        ...prev, 
        isSyncing: false, 
        pendingCount: 0,
        lastSyncTime: Date.now(),
      }));
    } catch (error) {
      console.error('Sync error:', error);
      setState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [state.isSyncing, state.isOnline, toast]);

  const saveStopsLocally = useCallback(async (stops: Stop[]) => {
    try {
      await offlineDB.saveStops(stops);
    } catch (error) {
      console.error('Error saving stops locally:', error);
    }
  }, []);

  const updateStopLocally = useCallback(async (
    stopId: string, 
    updates: Partial<Stop>,
    addToQueue = true
  ) => {
    try {
      await offlineDB.updateStop(stopId, updates, true);
      
      if (addToQueue && updates.status) {
        await offlineDB.addToSyncQueue({
          type: 'stop_status',
          data: { stopId, status: updates.status },
        });
      }
      
      await checkPendingItems();
    } catch (error) {
      console.error('Error updating stop locally:', error);
    }
  }, [checkPendingItems]);

  const getLocalStops = useCallback(async (): Promise<Stop[]> => {
    try {
      return await offlineDB.getStops();
    } catch (error) {
      console.error('Error getting local stops:', error);
      return [];
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      toast({
        title: 'Conectado!',
        description: 'Sincronizando dados...',
      });
      syncPendingData();
    };

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
      toast({
        title: 'Modo Offline',
        description: 'Suas alterações serão salvas localmente',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingData, toast]);

  useEffect(() => {
    if (state.isOnline) {
      syncIntervalRef.current = setInterval(() => {
        checkPendingItems().then(() => {
          if (state.pendingCount > 0) {
            syncPendingData();
          }
        });
      }, 30000);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [state.isOnline, state.pendingCount, checkPendingItems, syncPendingData]);

  return {
    ...state,
    syncNow: syncPendingData,
    saveStopsLocally,
    updateStopLocally,
    getLocalStops,
    checkPendingItems,
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { offlineDB, initOfflineDB } from '@/lib/indexedDB';
import type { Stop, Itinerary } from '@shared/schema';

export interface OfflineOperation {
  id: string;
  type: 'update_stop_status' | 'add_stop' | 'delete_stop' | 'reorder_stops' | 'create_itinerary';
  endpoint: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  timestamp: number;
  retries?: number;
}

const OFFLINE_QUEUE_KEY = 'optirota_offline_queue';
const MAX_RETRIES = 3;

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isDBReady, setIsDBReady] = useState(false);
  const { toast } = useToast();
  const syncingRef = useRef(false);

  // Initialize IndexedDB
  useEffect(() => {
    initOfflineDB().then(() => {
      setIsDBReady(true);
      loadPendingCount();
    });
  }, []);

  // Load pending count from IndexedDB
  const loadPendingCount = useCallback(async () => {
    try {
      const count = await offlineDB.getSyncQueueCount();
      const localQueue = getLocalQueue();
      setPendingCount(count + localQueue.length);
    } catch {
      const localQueue = getLocalQueue();
      setPendingCount(localQueue.length);
    }
  }, []);

  // Get queue from localStorage (fallback)
  const getLocalQueue = useCallback((): OfflineOperation[] => {
    try {
      const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  // Save queue to localStorage (fallback)
  const saveLocalQueue = useCallback((queue: OfflineOperation[]) => {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }, []);

  // Add operation to queue (uses IndexedDB + localStorage fallback)
  const addToQueue = useCallback(async (operation: Omit<OfflineOperation, 'id' | 'timestamp'>) => {
    const newOp: OfflineOperation = {
      ...operation,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retries: 0,
    };

    try {
      // Try IndexedDB first
      if (offlineDB.isReady()) {
        await offlineDB.addToSyncQueue({
          type: operation.type as 'stop_status' | 'stop_update' | 'stop_create' | 'stop_delete',
          endpoint: operation.endpoint,
          method: operation.method,
          data: operation.body as Record<string, unknown>,
        });
        console.log('[Offline] Added to IndexedDB queue:', operation.type);
      } else {
        // Fallback to localStorage
        const queue = getLocalQueue();
        queue.push(newOp);
        saveLocalQueue(queue);
        console.log('[Offline] Added to localStorage queue:', operation.type);
      }
    } catch (error) {
      // Fallback to localStorage on error
      console.error('[Offline] IndexedDB error, using localStorage:', error);
      const queue = getLocalQueue();
      queue.push(newOp);
      saveLocalQueue(queue);
    }

    await loadPendingCount();
    return newOp.id;
  }, [getLocalQueue, saveLocalQueue, loadPendingCount]);

  // Remove operation from queue
  const removeFromQueue = useCallback(async (operationId: string) => {
    try {
      if (offlineDB.isReady()) {
        await offlineDB.removeFromSyncQueue(operationId);
      }
    } catch {
      // Ignore errors
    }
    
    // Also remove from localStorage
    const queue = getLocalQueue();
    const filtered = queue.filter(op => op.id !== operationId);
    saveLocalQueue(filtered);
    
    await loadPendingCount();
  }, [getLocalQueue, saveLocalQueue, loadPendingCount]);

  // Clear entire queue
  const clearQueue = useCallback(async () => {
    try {
      if (offlineDB.isReady()) {
        const queue = await offlineDB.getSyncQueue();
        for (const item of queue) {
          await offlineDB.removeFromSyncQueue(item.id);
        }
      }
    } catch {
      // Ignore errors
    }
    saveLocalQueue([]);
    setPendingCount(0);
  }, [saveLocalQueue]);

  // Sync all pending operations to Supabase
  const syncQueue = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;

    // Get operations from both IndexedDB and localStorage
    let allOperations: OfflineOperation[] = [];
    
    try {
      if (offlineDB.isReady()) {
        const indexedDBQueue = await offlineDB.getSyncQueue();
        allOperations = indexedDBQueue.map(item => ({
          id: item.id,
          type: item.type as OfflineOperation['type'],
          endpoint: item.endpoint,
          method: item.method,
          body: item.data,
          timestamp: item.timestamp,
          retries: item.retries,
        }));
      }
    } catch (error) {
      console.error('[Offline] Error reading IndexedDB queue:', error);
    }

    // Add localStorage queue
    const localQueue = getLocalQueue();
    allOperations = [...allOperations, ...localQueue];

    if (allOperations.length === 0) return;

    syncingRef.current = true;
    setIsSyncing(true);
    console.log('[Offline] Syncing', allOperations.length, 'operations to Supabase...');

    let successCount = 0;
    let failCount = 0;

    // Sort by timestamp to maintain order
    allOperations.sort((a, b) => a.timestamp - b.timestamp);

    for (const operation of allOperations) {
      try {
        const response = await fetch(operation.endpoint, {
          method: operation.method,
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: operation.body ? JSON.stringify(operation.body) : undefined,
        });

        if (response.ok) {
          await removeFromQueue(operation.id);
          successCount++;
          console.log('[Offline] Synced to Supabase:', operation.type);
        } else if (response.status === 409 || response.status === 400) {
          // Conflict or bad request - remove from queue (data already exists or invalid)
          await removeFromQueue(operation.id);
          console.log('[Offline] Removed conflicting operation:', operation.type);
        } else {
          console.error('[Offline] Failed to sync:', operation.type, response.status);
          
          // Increment retries
          const retries = (operation.retries || 0) + 1;
          if (retries >= MAX_RETRIES) {
            await removeFromQueue(operation.id);
            console.log('[Offline] Max retries reached, removing:', operation.type);
          } else {
            try {
              if (offlineDB.isReady()) {
                await offlineDB.updateSyncQueueItem(operation.id, { retries });
              }
            } catch {
              // Ignore
            }
          }
          failCount++;
        }
      } catch (error) {
        console.error('[Offline] Sync error:', operation.type, error);
        failCount++;
      }
    }

    syncingRef.current = false;
    setIsSyncing(false);
    await loadPendingCount();

    if (successCount > 0) {
      // Invalidate all relevant queries to refresh data from Supabase
      queryClient.invalidateQueries({ queryKey: ['/api/stops'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/finance/cycle'] });
      queryClient.invalidateQueries({ queryKey: ['/api/itinerary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/earnings'] });
      
      toast({
        title: 'Dados sincronizados!',
        description: `${successCount} ${successCount === 1 ? 'alteração enviada' : 'alterações enviadas'} para o servidor.`,
      });
    }

    if (failCount > 0 && successCount === 0) {
      toast({
        title: 'Erro na sincronização',
        description: `${failCount} ${failCount === 1 ? 'operação falhou' : 'operações falharam'}. Tentando novamente...`,
        variant: 'destructive',
      });
    }
  }, [getLocalQueue, removeFromQueue, loadPendingCount, toast]);

  // Save stops locally for offline access
  const saveStopsLocally = useCallback(async (stops: Stop[]) => {
    try {
      if (offlineDB.isReady()) {
        await offlineDB.saveStops(stops);
        console.log('[Offline] Saved', stops.length, 'stops locally');
      }
    } catch (error) {
      console.error('[Offline] Error saving stops:', error);
    }
  }, []);

  // Get stops from local storage
  const getLocalStops = useCallback(async (): Promise<Stop[]> => {
    try {
      if (offlineDB.isReady()) {
        return await offlineDB.getStops();
      }
    } catch (error) {
      console.error('[Offline] Error getting local stops:', error);
    }
    return [];
  }, []);

  // Save itinerary locally
  const saveItineraryLocally = useCallback(async (itinerary: Itinerary) => {
    try {
      if (offlineDB.isReady()) {
        await offlineDB.saveItinerary(itinerary);
        console.log('[Offline] Saved itinerary locally');
      }
    } catch (error) {
      console.error('[Offline] Error saving itinerary:', error);
    }
  }, []);

  // Get local itinerary
  const getLocalItinerary = useCallback(async (userId: string): Promise<Itinerary | null> => {
    try {
      if (offlineDB.isReady()) {
        return await offlineDB.getItinerary(userId);
      }
    } catch (error) {
      console.error('[Offline] Error getting local itinerary:', error);
    }
    return null;
  }, []);

  // Update stop status locally (for offline mode)
  const updateStopLocally = useCallback(async (stopId: string, updates: Partial<Stop>) => {
    try {
      if (offlineDB.isReady()) {
        await offlineDB.updateStop(stopId, updates, true);
        console.log('[Offline] Updated stop locally:', stopId);
      }
    } catch (error) {
      console.error('[Offline] Error updating stop locally:', error);
    }
  }, []);

  // Add stop locally (for offline mode)
  const addStopLocally = useCallback(async (stop: Stop) => {
    try {
      if (offlineDB.isReady()) {
        await offlineDB.addStopLocally(stop);
        console.log('[Offline] Added stop locally:', stop.id);
      }
    } catch (error) {
      console.error('[Offline] Error adding stop locally:', error);
    }
  }, []);

  // Delete stop locally
  const deleteStopLocally = useCallback(async (stopId: string) => {
    try {
      if (offlineDB.isReady()) {
        await offlineDB.deleteStopLocally(stopId);
        console.log('[Offline] Deleted stop locally:', stopId);
      }
    } catch (error) {
      console.error('[Offline] Error deleting stop locally:', error);
    }
  }, []);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Offline] Connection restored');
      setIsOnline(true);
      toast({
        title: 'Conexão restaurada',
        description: 'Sincronizando dados com o servidor...',
      });
      // Wait a bit before syncing to ensure stable connection
      setTimeout(syncQueue, 2000);
    };

    const handleOffline = () => {
      console.log('[Offline] Connection lost');
      setIsOnline(false);
      toast({
        title: 'Sem conexão',
        description: 'Modo offline ativado. Suas alterações serão salvas localmente.',
        variant: 'destructive',
      });
    };

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_REQUESTED') {
        console.log('[Offline] Service worker requested sync');
        syncQueue();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);

    // Sync on mount if online
    if (navigator.onLine && isDBReady) {
      setTimeout(syncQueue, 1000);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [syncQueue, toast, isDBReady]);

  // Periodic sync check (every 30 seconds when online)
  useEffect(() => {
    if (!isOnline || !isDBReady) return;

    const interval = setInterval(() => {
      if (navigator.onLine && !syncingRef.current) {
        loadPendingCount().then(async () => {
          const count = await offlineDB.getSyncQueueCount();
          if (count > 0) {
            console.log('[Offline] Periodic sync check - found pending operations');
            syncQueue();
          }
        });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOnline, isDBReady, loadPendingCount, syncQueue]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    isDBReady,
    addToQueue,
    removeFromQueue,
    clearQueue,
    syncQueue,
    saveStopsLocally,
    getLocalStops,
    saveItineraryLocally,
    getLocalItinerary,
    updateStopLocally,
    addStopLocally,
    deleteStopLocally,
  };
}

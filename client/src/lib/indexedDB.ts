import type { Stop, Itinerary } from '@shared/schema';

const DB_NAME = 'optirota_offline_db';
const DB_VERSION = 3;

interface SyncQueueItem {
  id: string;
  type: 'stop_status' | 'stop_update' | 'stop_create' | 'stop_delete' | 'itinerary_create' | 'itinerary_update';
  endpoint: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  data: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

export interface OfflineUser {
  id: string;
  email: string;
  name: string;
  accountId: string;
}

class OfflineDatabase {
  private db: IDBDatabase | null = null;
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized && this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        console.log('[IndexedDB] Database initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.log('[IndexedDB] Upgrading database to version', DB_VERSION);

        // Stops - entregas
        if (!db.objectStoreNames.contains('stops')) {
          const stopsStore = db.createObjectStore('stops', { keyPath: 'id' });
          stopsStore.createIndex('itineraryId', 'itineraryId', { unique: false });
          stopsStore.createIndex('status', 'status', { unique: false });
          stopsStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        }

        // Itineraries - rotas
        if (!db.objectStoreNames.contains('itineraries')) {
          const itinStore = db.createObjectStore('itineraries', { keyPath: 'id' });
          itinStore.createIndex('userId', 'userId', { unique: false });
          itinStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        }

        // Sync queue - fila de sincronização
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
          syncStore.createIndex('type', 'type', { unique: false });
        }

        // Settings - configurações da conta
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // User session - dados do usuário logado
        if (!db.objectStoreNames.contains('userSession')) {
          db.createObjectStore('userSession', { keyPath: 'key' });
        }

        // Cached data - dados em cache para uso offline
        if (!db.objectStoreNames.contains('cachedData')) {
          const cacheStore = db.createObjectStore('cachedData', { keyPath: 'key' });
          cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Map tiles - tiles do mapa para uso offline
        if (!db.objectStoreNames.contains('mapTiles')) {
          const tilesStore = db.createObjectStore('mapTiles', { keyPath: 'key' });
          tilesStore.createIndex('city', 'city', { unique: false });
          tilesStore.createIndex('zoom', 'zoom', { unique: false });
        }

        // Offline cities - cidades baixadas para uso offline
        if (!db.objectStoreNames.contains('offlineCities')) {
          db.createObjectStore('offlineCities', { keyPath: 'id' });
        }
      };
    });
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  async saveStops(stops: (Stop & { syncStatus?: string })[]): Promise<void> {
    const store = this.getStore('stops', 'readwrite');
    const promises = stops.map(stop => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put({ ...stop, syncStatus: stop.syncStatus || 'synced' });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    await Promise.all(promises);
  }

  async getStops(): Promise<Stop[]> {
    const store = this.getStore('stops');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateStop(stopId: string, updates: Partial<Stop>, markPending = true): Promise<void> {
    const store = this.getStore('stops', 'readwrite');
    return new Promise((resolve, reject) => {
      const getRequest = store.get(stopId);
      getRequest.onsuccess = () => {
        const stop = getRequest.result;
        if (stop) {
          const updated = { 
            ...stop, 
            ...updates, 
            syncStatus: markPending ? 'pending' : stop.syncStatus 
          };
          const putRequest = store.put(updated);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async saveItinerary(itinerary: Itinerary & { syncStatus?: string }): Promise<void> {
    const store = this.getStore('itineraries', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ ...itinerary, syncStatus: itinerary.syncStatus || 'synced' });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getItinerary(userId: string): Promise<(Itinerary & { syncStatus?: string }) | null> {
    const store = this.getStore('itineraries');
    const index = store.index('userId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => {
        const results = request.result;
        const active = results.find((i: Itinerary) => i.status === 'active');
        resolve(active || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    const store = this.getStore('syncQueue', 'readwrite');
    const queueItem: SyncQueueItem = {
      id: crypto.randomUUID(),
      ...item,
      timestamp: Date.now(),
      retries: 0,
    };
    return new Promise((resolve, reject) => {
      const request = store.add(queueItem);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    const store = this.getStore('syncQueue');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const items = request.result.sort((a: SyncQueueItem, b: SyncQueueItem) => a.timestamp - b.timestamp);
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async removeFromSyncQueue(id: string): Promise<void> {
    const store = this.getStore('syncQueue', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingStops(): Promise<Stop[]> {
    const store = this.getStore('stops');
    const index = store.index('syncStatus');
    return new Promise((resolve, reject) => {
      const request = index.getAll('pending');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markStopAsSynced(stopId: string): Promise<void> {
    return this.updateStop(stopId, {}, false);
  }

  async clearAll(): Promise<void> {
    const stores = ['stops', 'itineraries', 'syncQueue'];
    for (const storeName of stores) {
      const store = this.getStore(storeName, 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }

  async saveSetting(key: string, value: unknown): Promise<void> {
    const store = this.getStore('settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value, updatedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSetting<T>(key: string): Promise<T | null> {
    const store = this.getStore('settings');
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  }

  // User session methods
  async saveUserSession(user: OfflineUser): Promise<void> {
    const store = this.getStore('userSession', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ key: 'currentUser', user, timestamp: Date.now() });
      request.onsuccess = () => {
        console.log('[IndexedDB] User session saved');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getUserSession(): Promise<OfflineUser | null> {
    try {
      const store = this.getStore('userSession');
      return new Promise((resolve, reject) => {
        const request = store.get('currentUser');
        request.onsuccess = () => resolve(request.result?.user || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  async clearUserSession(): Promise<void> {
    try {
      const store = this.getStore('userSession', 'readwrite');
      return new Promise((resolve, reject) => {
        const request = store.delete('currentUser');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Ignore errors
    }
  }

  // Cache methods for offline data
  async saveCache(key: string, data: unknown): Promise<void> {
    const store = this.getStore('cachedData', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ key, data, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCache<T>(key: string): Promise<T | null> {
    try {
      const store = this.getStore('cachedData');
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.data || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  // Add a single stop locally (for offline creation)
  async addStopLocally(stop: Stop & { syncStatus?: string }): Promise<void> {
    const store = this.getStore('stops', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ ...stop, syncStatus: stop.syncStatus || 'pending' });
      request.onsuccess = () => {
        console.log('[IndexedDB] Stop added locally:', stop.id);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Delete a stop locally
  async deleteStopLocally(stopId: string): Promise<void> {
    const store = this.getStore('stops', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(stopId);
      request.onsuccess = () => {
        console.log('[IndexedDB] Stop deleted locally:', stopId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Get a single stop by ID
  async getStopById(stopId: string): Promise<(Stop & { syncStatus?: string }) | null> {
    try {
      const store = this.getStore('stops');
      return new Promise((resolve, reject) => {
        const request = store.get(stopId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  // Get stops by itinerary ID
  async getStopsByItinerary(itineraryId: string): Promise<Stop[]> {
    try {
      const store = this.getStore('stops');
      const index = store.index('itineraryId');
      return new Promise((resolve, reject) => {
        const request = index.getAll(itineraryId);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  // Update sync queue item retries
  async updateSyncQueueItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
    const store = this.getStore('syncQueue', 'readwrite');
    return new Promise((resolve, reject) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          const updated = { ...item, ...updates };
          const putRequest = store.put(updated);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // Get sync queue count
  async getSyncQueueCount(): Promise<number> {
    try {
      const queue = await this.getSyncQueue();
      return queue.length;
    } catch {
      return 0;
    }
  }

  // Check if database is initialized
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  // Map tiles methods
  async saveTile(key: string, blob: Blob, city: string, zoom: number): Promise<void> {
    const store = this.getStore('mapTiles', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ key, blob, city, zoom, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getTile(key: string): Promise<Blob | null> {
    try {
      const store = this.getStore('mapTiles');
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.blob || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  async getTileCount(city?: string): Promise<number> {
    try {
      const store = this.getStore('mapTiles');
      if (city) {
        const index = store.index('city');
        return new Promise((resolve, reject) => {
          const request = index.count(city);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
      return new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return 0;
    }
  }

  async clearTilesByCity(city: string): Promise<void> {
    const store = this.getStore('mapTiles', 'readwrite');
    const index = store.index('city');
    return new Promise((resolve, reject) => {
      const request = index.openCursor(city);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllTiles(): Promise<void> {
    const store = this.getStore('mapTiles', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Offline cities methods
  async saveOfflineCity(city: { id: string; name: string; tilesCount: number; downloadedAt: number }): Promise<void> {
    const store = this.getStore('offlineCities', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(city);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getOfflineCities(): Promise<{ id: string; name: string; tilesCount: number; downloadedAt: number }[]> {
    try {
      const store = this.getStore('offlineCities');
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  async removeOfflineCity(cityId: string): Promise<void> {
    const store = this.getStore('offlineCities', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(cityId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const offlineDB = new OfflineDatabase();

export async function initOfflineDB(): Promise<void> {
  try {
    await offlineDB.init();
    console.log('[IndexedDB] Offline database initialized');
  } catch (error) {
    console.error('[IndexedDB] Failed to initialize', error);
  }
}

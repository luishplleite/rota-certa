/* OptiRota - Custom JavaScript for Mobile WebView */
/* Versao 3.0 - Suporte completo offline com tiles de mapa */

(function() {
  'use strict';

  console.log('[OptiRota] Custom JS v3.0 initializing...');

  // 1. Keep screen on during delivery (WakeLock)
  function keepScreenOn() {
    if (typeof median !== 'undefined' && median.screen && median.screen.keepScreenOn) {
      median.screen.keepScreenOn();
      console.log('[OptiRota] WakeLock ativado via Median Bridge');
    } else if (typeof gonative !== 'undefined' && gonative.screen && gonative.screen.keepScreenOn) {
      gonative.screen.keepScreenOn();
      console.log('[OptiRota] WakeLock ativado via GoNative Bridge');
    } else {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(lock => {
          console.log('[OptiRota] WakeLock ativado via Web API');
        }).catch(err => {
          console.warn('[OptiRota] WakeLock Web API falhou:', err);
        });
      } else {
        console.warn('[OptiRota] WakeLock nao disponivel');
      }
    }
  }

  // 2. Offline Database Configuration
  const OfflineDB = {
    dbName: 'optirota_offline_db',
    version: 3,
    db: null,

    init: function() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          console.log('[OptiRota] Criando/atualizando banco offline v3...');

          const tables = [
            { name: 'stops', keyPath: 'id', indexes: ['itineraryId', 'status', 'syncStatus'] },
            { name: 'itineraries', keyPath: 'id', indexes: ['userId', 'syncStatus'] },
            { name: 'syncQueue', keyPath: 'id', indexes: ['timestamp', 'type'] },
            { name: 'settings', keyPath: 'key' },
            { name: 'userSession', keyPath: 'key' },
            { name: 'cachedData', keyPath: 'key', indexes: ['timestamp'] },
            { name: 'mapTiles', keyPath: 'key', indexes: ['city', 'zoom'] },
            { name: 'offlineCities', keyPath: 'id' }
          ];

          tables.forEach(table => {
            if (!db.objectStoreNames.contains(table.name)) {
              const store = db.createObjectStore(table.name, { keyPath: table.keyPath });
              if (table.indexes) {
                table.indexes.forEach(idx => {
                  store.createIndex(idx, idx, { unique: false });
                });
              }
              console.log('[OptiRota] Store criado:', table.name);
            }
          });
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          console.log('[OptiRota] Banco offline v3 inicializado');
          resolve(this.db);
        };

        request.onerror = (event) => {
          console.error('[OptiRota] Erro ao abrir banco:', event.target.error);
          reject(event.target.error);
        };
      });
    },

    saveData: function(table, data) {
      return new Promise((resolve, reject) => {
        if (!this.db) return reject('DB nao inicializado');

        const transaction = this.db.transaction([table], 'readwrite');
        const store = transaction.objectStore(table);

        if (Array.isArray(data)) {
          data.forEach(item => store.put(item));
        } else {
          store.put(data);
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    },

    getData: function(table) {
      return new Promise((resolve, reject) => {
        if (!this.db) return reject('DB nao inicializado');

        const transaction = this.db.transaction([table], 'readonly');
        const store = transaction.objectStore(table);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    getByKey: function(table, key) {
      return new Promise((resolve, reject) => {
        if (!this.db) return reject('DB nao inicializado');

        const transaction = this.db.transaction([table], 'readonly');
        const store = transaction.objectStore(table);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    deleteData: function(table, key) {
      return new Promise((resolve, reject) => {
        if (!this.db) return reject('DB nao inicializado');

        const transaction = this.db.transaction([table], 'readwrite');
        const store = transaction.objectStore(table);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    clearTable: function(table) {
      return new Promise((resolve, reject) => {
        if (!this.db) return reject('DB nao inicializado');

        const transaction = this.db.transaction([table], 'readwrite');
        const store = transaction.objectStore(table);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    // Map tiles methods
    saveTile: function(key, blob, city, zoom) {
      return new Promise((resolve, reject) => {
        if (!this.db) return reject('DB nao inicializado');

        const transaction = this.db.transaction(['mapTiles'], 'readwrite');
        const store = transaction.objectStore('mapTiles');
        const request = store.put({ key, blob, city, zoom, timestamp: Date.now() });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    getTile: function(key) {
      return new Promise((resolve, reject) => {
        if (!this.db) return reject('DB nao inicializado');

        const transaction = this.db.transaction(['mapTiles'], 'readonly');
        const store = transaction.objectStore('mapTiles');
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result ? request.result.blob : null);
        request.onerror = () => reject(request.error);
      });
    },

    getTileCount: function() {
      return new Promise((resolve, reject) => {
        if (!this.db) return reject('DB nao inicializado');

        const transaction = this.db.transaction(['mapTiles'], 'readonly');
        const store = transaction.objectStore('mapTiles');
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    getOfflineCities: function() {
      return this.getData('offlineCities');
    }
  };

  // 3. Sync Manager
  const SyncManager = {
    isSyncing: false,
    baseUrl: '',

    init: function(baseUrl) {
      this.baseUrl = baseUrl || window.location.origin;
      console.log('[OptiRota] SyncManager inicializado, baseUrl:', this.baseUrl);
    },

    downloadInitialData: async function() {
      if (!navigator.onLine) {
        console.log('[OptiRota] Offline - usando dados locais');
        return;
      }

      console.log('[OptiRota] Baixando dados iniciais...');

      const endpoints = [
        { endpoint: '/api/stops', table: 'stops' },
        { endpoint: '/api/itinerary', table: 'itineraries' },
        { endpoint: '/api/settings', table: 'settings', transform: (data) => ({ key: 'accountSettings', ...data }) }
      ];

      for (const { endpoint, table, transform } of endpoints) {
        try {
          const response = await fetch(this.baseUrl + endpoint, { credentials: 'include' });
          if (response.ok) {
            let data = await response.json();
            if (transform) data = transform(data);
            await OfflineDB.saveData(table, data);
            console.log('[OptiRota] Sincronizado:', table);
          }
        } catch (error) {
          console.error('[OptiRota] Erro ao sincronizar', table, ':', error);
        }
      }

      console.log('[OptiRota] Download inicial concluido');
    },

    uploadPendingChanges: async function() {
      if (!navigator.onLine || this.isSyncing) return;

      this.isSyncing = true;
      console.log('[OptiRota] Enviando alteracoes pendentes...');

      try {
        const queue = await OfflineDB.getData('syncQueue');
        if (!queue || queue.length === 0) {
          console.log('[OptiRota] Nenhuma alteracao pendente');
          this.isSyncing = false;
          return;
        }

        console.log('[OptiRota] Pendentes:', queue.length);

        queue.sort((a, b) => a.timestamp - b.timestamp);

        for (const item of queue) {
          try {
            const options = {
              method: item.method,
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include'
            };

            if (item.method !== 'DELETE' && item.data) {
              options.body = JSON.stringify(item.data);
            }

            const response = await fetch(this.baseUrl + item.endpoint, options);

            if (response.ok || response.status === 409 || response.status === 400) {
              await OfflineDB.deleteData('syncQueue', item.id);
              console.log('[OptiRota] Sincronizado:', item.type);
            } else if (item.retries >= 3) {
              await OfflineDB.deleteData('syncQueue', item.id);
              console.log('[OptiRota] Max retries, removendo:', item.type);
            } else {
              item.retries = (item.retries || 0) + 1;
              await OfflineDB.saveData('syncQueue', item);
            }
          } catch (error) {
            console.error('[OptiRota] Erro ao sincronizar item:', error);
          }
        }

        console.log('[OptiRota] Upload concluido');
      } catch (error) {
        console.error('[OptiRota] Erro no upload:', error);
      } finally {
        this.isSyncing = false;
      }
    },

    addToQueue: async function(type, endpoint, method, data) {
      const item = {
        id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
        type: type,
        endpoint: endpoint,
        method: method,
        data: data,
        timestamp: Date.now(),
        retries: 0
      };

      await OfflineDB.saveData('syncQueue', item);
      console.log('[OptiRota] Adicionado a fila:', type);

      if (navigator.onLine) {
        setTimeout(() => this.uploadPendingChanges(), 1000);
      }
    }
  };

  // 4. Map Tile Manager - Gerencia tiles de mapa offline
  const MapTileManager = {
    TILE_URL: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    SUBDOMAINS: ['a', 'b', 'c', 'd'],

    getTileUrl: function(z, x, y) {
      const subdomain = this.SUBDOMAINS[Math.floor(Math.random() * this.SUBDOMAINS.length)];
      return this.TILE_URL
        .replace('{s}', subdomain)
        .replace('{z}', z.toString())
        .replace('{x}', x.toString())
        .replace('{y}', y.toString());
    },

    getTileKey: function(z, x, y) {
      return z + '/' + x + '/' + y;
    },

    // Verifica se tem tile no cache, se nao baixa
    getTileWithFallback: async function(z, x, y) {
      const key = this.getTileKey(z, x, y);

      // Tenta cache primeiro
      try {
        const cachedBlob = await OfflineDB.getTile(key);
        if (cachedBlob) {
          return URL.createObjectURL(cachedBlob);
        }
      } catch (e) {
        console.warn('[OptiRota] Erro ao ler tile do cache:', e);
      }

      // Se online, baixa e salva
      if (navigator.onLine) {
        try {
          const url = this.getTileUrl(z, x, y);
          const response = await fetch(url);
          if (response.ok) {
            const blob = await response.blob();
            // Salva no cache para uso futuro
            try {
              await OfflineDB.saveTile(key, blob, 'auto', z);
            } catch (e) {
              console.warn('[OptiRota] Erro ao salvar tile:', e);
            }
            return URL.createObjectURL(blob);
          }
        } catch (e) {
          console.warn('[OptiRota] Erro ao baixar tile:', e);
        }
      }

      return null;
    },

    // Retorna estatisticas do cache de tiles
    getStats: async function() {
      try {
        const count = await OfflineDB.getTileCount();
        const cities = await OfflineDB.getOfflineCities();
        return { tileCount: count, cities: cities };
      } catch (e) {
        return { tileCount: 0, cities: [] };
      }
    }
  };

  // 5. Connection Monitor
  function setupConnectionMonitor() {
    window.addEventListener('online', () => {
      console.log('[OptiRota] Conexao restaurada');
      showToast('Conexao restaurada', 'Sincronizando dados...');
      SyncManager.uploadPendingChanges();
      SyncManager.downloadInitialData();
    });

    window.addEventListener('offline', () => {
      console.log('[OptiRota] Sem conexao');
      showToast('Modo offline', 'Usando dados e mapas salvos localmente.');
    });
  }

  // 6. Toast notification helper
  function showToast(title, message) {
    const event = new CustomEvent('optirota-toast', {
      detail: { title, message }
    });
    window.dispatchEvent(event);
  }

  // 7. Service Worker cache all assets
  function cacheAppForOffline() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('cacheAllAssets');
      console.log('[OptiRota] Solicitado cache de assets');
    }
  }

  // 8. Check offline status
  function getOfflineStatus() {
    return {
      isOnline: navigator.onLine,
      dbReady: OfflineDB.db !== null
    };
  }

  // 9. Initialize everything on DOM ready
  document.addEventListener('DOMContentLoaded', async () => {
    console.log('[OptiRota] DOM ready, inicializando v3...');

    keepScreenOn();

    try {
      await OfflineDB.init();
      SyncManager.init();
      setupConnectionMonitor();

      if (navigator.onLine) {
        await SyncManager.downloadInitialData();
      }

      cacheAppForOffline();

      // Log estatisticas de tiles
      const stats = await MapTileManager.getStats();
      console.log('[OptiRota] Tiles em cache:', stats.tileCount);
      console.log('[OptiRota] Cidades offline:', stats.cities.length);

      console.log('[OptiRota] Inicializacao v3 completa');
    } catch (error) {
      console.error('[OptiRota] Erro na inicializacao:', error);
    }
  });

  // 10. Export to global scope for app integration
  window.OptiRotaOffline = {
    version: '3.0',
    OfflineDB,
    SyncManager,
    MapTileManager,
    keepScreenOn,
    cacheAppForOffline,
    getOfflineStatus,
    showToast
  };

})();

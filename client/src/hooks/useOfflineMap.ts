import { useState, useCallback, useEffect } from 'react';
import { offlineDB, initOfflineDB } from '@/lib/indexedDB';
import { 
  BRAZILIAN_CITIES, 
  CityBounds, 
  getTilesForBounds, 
  estimateTileCount,
  formatStorageSize 
} from '@/lib/offlineCities';

const TILE_URL_TEMPLATE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
const SUBDOMAINS = ['a', 'b', 'c', 'd'];
const MIN_ZOOM = 13;
const MAX_ZOOM = 17;
const BATCH_SIZE = 10;
const TILE_SIZE_ESTIMATE = 15000;

interface DownloadProgress {
  current: number;
  total: number;
  percentage: number;
  status: 'idle' | 'downloading' | 'completed' | 'error' | 'cancelled';
  error?: string;
}

interface OfflineCity {
  id: string;
  name: string;
  tilesCount: number;
  downloadedAt: number;
}

export function useOfflineMap() {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    current: 0,
    total: 0,
    percentage: 0,
    status: 'idle'
  });
  const [offlineCities, setOfflineCities] = useState<OfflineCity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const loadOfflineCities = useCallback(async () => {
    try {
      await initOfflineDB();
      const cities = await offlineDB.getOfflineCities();
      setOfflineCities(cities);
    } catch (error) {
      console.error('[OfflineMap] Error loading offline cities:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOfflineCities();
  }, [loadOfflineCities]);

  const getTileUrl = (z: number, x: number, y: number): string => {
    const subdomain = SUBDOMAINS[Math.floor(Math.random() * SUBDOMAINS.length)];
    return TILE_URL_TEMPLATE
      .replace('{s}', subdomain)
      .replace('{z}', z.toString())
      .replace('{x}', x.toString())
      .replace('{y}', y.toString());
  };

  const downloadTile = async (z: number, x: number, y: number, cityId: string, signal: AbortSignal): Promise<boolean> => {
    const key = `${z}/${x}/${y}`;
    
    const existingTile = await offlineDB.getTile(key);
    if (existingTile) {
      return true;
    }
    
    try {
      const url = getTileUrl(z, x, y);
      const response = await fetch(url, { signal });
      
      if (!response.ok) {
        return false;
      }
      
      const blob = await response.blob();
      await offlineDB.saveTile(key, blob, cityId, z);
      return true;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw error;
      }
      console.warn(`[OfflineMap] Failed to download tile ${key}:`, error);
      return false;
    }
  };

  const downloadCityTiles = useCallback(async (cityId: string) => {
    const city = BRAZILIAN_CITIES.find(c => c.id === cityId);
    if (!city) {
      setDownloadProgress(prev => ({
        ...prev,
        status: 'error',
        error: 'Cidade nao encontrada'
      }));
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);

    const tiles = getTilesForBounds(city.bounds, MIN_ZOOM, MAX_ZOOM);
    const total = tiles.length;

    setDownloadProgress({
      current: 0,
      total,
      percentage: 0,
      status: 'downloading'
    });

    let downloaded = 0;
    let failed = 0;

    try {
      for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
        if (controller.signal.aborted) {
          throw new Error('Cancelled');
        }

        const batch = tiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(tile => downloadTile(tile.z, tile.x, tile.y, cityId, controller.signal))
        );

        downloaded += results.filter(Boolean).length;
        failed += results.filter(r => !r).length;

        setDownloadProgress({
          current: downloaded,
          total,
          percentage: Math.round((downloaded / total) * 100),
          status: 'downloading'
        });

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      await offlineDB.saveOfflineCity({
        id: cityId,
        name: `${city.name} - ${city.state}`,
        tilesCount: downloaded,
        downloadedAt: Date.now()
      });

      setDownloadProgress({
        current: downloaded,
        total,
        percentage: 100,
        status: 'completed'
      });

      await loadOfflineCities();
    } catch (error) {
      if ((error as Error).message === 'Cancelled' || (error as Error).name === 'AbortError') {
        setDownloadProgress(prev => ({
          ...prev,
          status: 'cancelled'
        }));
      } else {
        setDownloadProgress(prev => ({
          ...prev,
          status: 'error',
          error: (error as Error).message
        }));
      }
    } finally {
      setAbortController(null);
    }
  }, [loadOfflineCities]);

  const cancelDownload = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
  }, [abortController]);

  const removeCityTiles = useCallback(async (cityId: string) => {
    try {
      await offlineDB.clearTilesByCity(cityId);
      await offlineDB.removeOfflineCity(cityId);
      await loadOfflineCities();
    } catch (error) {
      console.error('[OfflineMap] Error removing city tiles:', error);
    }
  }, [loadOfflineCities]);

  const clearAllTiles = useCallback(async () => {
    try {
      await offlineDB.clearAllTiles();
      const cities = await offlineDB.getOfflineCities();
      for (const city of cities) {
        await offlineDB.removeOfflineCity(city.id);
      }
      setOfflineCities([]);
    } catch (error) {
      console.error('[OfflineMap] Error clearing all tiles:', error);
    }
  }, []);

  const estimateDownloadSize = useCallback((cityId: string): { tiles: number; sizeEstimate: string } => {
    const city = BRAZILIAN_CITIES.find(c => c.id === cityId);
    if (!city) return { tiles: 0, sizeEstimate: '0 MB' };
    
    const tiles = estimateTileCount(city.bounds, MIN_ZOOM, MAX_ZOOM);
    const size = tiles * TILE_SIZE_ESTIMATE;
    return { tiles, sizeEstimate: formatStorageSize(size) };
  }, []);

  const isCityDownloaded = useCallback((cityId: string): boolean => {
    return offlineCities.some(c => c.id === cityId);
  }, [offlineCities]);

  const resetProgress = useCallback(() => {
    setDownloadProgress({
      current: 0,
      total: 0,
      percentage: 0,
      status: 'idle'
    });
  }, []);

  return {
    cities: BRAZILIAN_CITIES,
    offlineCities,
    downloadProgress,
    isLoading,
    downloadCityTiles,
    cancelDownload,
    removeCityTiles,
    clearAllTiles,
    estimateDownloadSize,
    isCityDownloaded,
    resetProgress
  };
}

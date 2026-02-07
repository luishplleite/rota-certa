import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Stop, Itinerary } from '@shared/schema';

interface OfflineState {
  stops: Stop[];
  itinerary: Itinerary | null;
  lastSync: number | null;
  
  setStops: (stops: Stop[]) => void;
  updateStop: (stopId: string, updates: Partial<Stop>) => void;
  setItinerary: (itinerary: Itinerary | null) => void;
  setLastSync: (timestamp: number) => void;
  clearOfflineData: () => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      stops: [],
      itinerary: null,
      lastSync: null,

      setStops: (stops: Stop[]) => set({ stops, lastSync: Date.now() }),
      
      updateStop: (stopId: string, updates: Partial<Stop>) => {
        const { stops } = get();
        const updatedStops = stops.map(stop =>
          stop.id === stopId ? { ...stop, ...updates } : stop
        );
        set({ stops: updatedStops });
      },
      
      setItinerary: (itinerary: Itinerary | null) => set({ itinerary }),
      
      setLastSync: (timestamp: number) => set({ lastSync: timestamp }),
      
      clearOfflineData: () => set({ stops: [], itinerary: null, lastSync: null }),
    }),
    {
      name: 'optirota_offline_store',
    }
  )
);

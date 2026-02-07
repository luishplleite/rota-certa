import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Itinerary, Stop, Coordinates, Earnings, SubscriptionInfo, AccountSettings } from '@shared/schema';
import { BUSINESS_RULES } from '@shared/schema';

interface AuthState {
  user: User | null;
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setSubscription: (subscription: SubscriptionInfo | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      subscription: null,
      isLoading: false,
      setUser: (user) => set({ user, isLoading: false }),
      setSubscription: (subscription) => set({ subscription }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null, subscription: null, isLoading: false }),
    }),
    { name: 'rotacerta-auth' }
  )
);

interface ItineraryState {
  itinerary: Itinerary | null;
  stops: Stop[];
  isLoading: boolean;
  
  setItinerary: (itinerary: Itinerary | null) => void;
  setStops: (stops: Stop[]) => void;
  addStops: (stops: Stop[]) => void;
  updateStop: (id: string, updates: Partial<Stop>) => void;
  removeStop: (id: string) => void;
  reorderStops: (stops: Stop[]) => void;
  setLoading: (loading: boolean) => void;
  clearAll: () => void;
  
  getCurrentStop: () => Stop | undefined;
  getPendingStops: () => Stop[];
  getDeliveredCount: () => number;
  getEarnings: () => Earnings;
}

export const useItineraryStore = create<ItineraryState>()((set, get) => ({
  itinerary: null,
  stops: [],
  isLoading: false,

  setItinerary: (itinerary) => set({ itinerary }),
  
  setStops: (stops) => set({ stops: stops.sort((a, b) => a.sequenceOrder - b.sequenceOrder) }),
  
  addStops: (newStops) => set((state) => ({
    stops: [...state.stops, ...newStops].sort((a, b) => a.sequenceOrder - b.sequenceOrder),
  })),
  
  updateStop: (id, updates) => set((state) => ({
    stops: state.stops.map((stop) =>
      stop.id === id ? { ...stop, ...updates } : stop
    ),
  })),
  
  removeStop: (id) => set((state) => ({
    stops: state.stops.filter((stop) => stop.id !== id),
  })),
  
  reorderStops: (stops) => set({ stops }),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  clearAll: () => set({ itinerary: null, stops: [] }),

  getCurrentStop: () => {
    const { stops } = get();
    return stops.find((s) => s.status === 'current') || 
           stops.find((s) => s.status === 'pending');
  },
  
  getPendingStops: () => {
    const { stops } = get();
    return stops.filter((s) => s.status === 'pending' || s.status === 'current');
  },
  
  getDeliveredCount: () => {
    const { stops } = get();
    return stops.filter((s) => s.status === 'delivered').length;
  },
  
  getEarnings: () => {
    const { stops, itinerary } = get();
    const settings = useSettingsStore.getState().settings;
    const deliveredCount = stops.filter((s) => s.status === 'delivered').length;
    const date = itinerary?.date ? new Date(itinerary.date) : new Date();
    
    const base = deliveredCount * settings.earningPerDelivery;
    const isSunday = date.getDay() === 0;
    const qualifiesForBonus = isSunday && deliveredCount > settings.sundayBonusThreshold;
    const bonus = qualifiesForBonus ? settings.sundayBonusValue : 0;
    
    return { base, bonus, total: base + bonus };
  },
}));

interface LocationState {
  currentLocation: Coordinates | null;
  isWatching: boolean;
  error: string | null;
  
  setLocation: (coords: Coordinates | null) => void;
  setWatching: (watching: boolean) => void;
  setError: (error: string | null) => void;
}

export const useLocationStore = create<LocationState>()((set) => ({
  currentLocation: null,
  isWatching: false,
  error: null,
  
  setLocation: (currentLocation) => set({ currentLocation, error: null }),
  setWatching: (isWatching) => set({ isWatching }),
  setError: (error) => set({ error }),
}));

interface PreferencesState {
  preferredNavApp: 'waze' | 'google_maps';
  soundEnabled: boolean;
  
  setNavApp: (app: 'waze' | 'google_maps') => void;
  toggleSound: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      preferredNavApp: 'waze',
      soundEnabled: true,
      
      setNavApp: (preferredNavApp) => set({ preferredNavApp }),
      toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
    }),
    { name: 'rotacerta-preferences' }
  )
);

interface SettingsState {
  settings: AccountSettings;
  setSettings: (settings: AccountSettings) => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: {
    earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
    sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
    sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
  },
  setSettings: (settings) => set({ settings }),
}));

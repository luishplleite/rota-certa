import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NavigationState {
  lastPath: string;
  setLastPath: (path: string) => void;
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set) => ({
      lastPath: '/plan',
      setLastPath: (path: string) => set({ lastPath: path }),
    }),
    {
      name: 'optirota_navigation',
    }
  )
);

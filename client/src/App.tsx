import { useEffect, useState } from 'react';
import { Switch, Route, Redirect, useLocation } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Layout } from '@/components/layout';
import { LoginPage, SignupPage, PlanPage, DrivePage, FinancePage, SettingsPage } from '@/pages';
import StreetPlanner from '@/pages/StreetPlanner';
import { AdminLoginPage } from '@/pages/AdminLoginPage';
import { AdminSignupPage } from '@/pages/AdminSignupPage';
import { AdminDashboardPage } from '@/pages/AdminDashboardPage';
import { useAuthStore, useItineraryStore, useLocationStore, useSettingsStore } from '@/lib/stores';
import { useNavigationStore } from '@/lib/navigationStore';
import type { Stop, User, AccountSettings } from '@shared/schema';

async function prefetchAllData() {
  const endpoints = [
    '/api/stops',
    '/api/itinerary',
    '/api/itinerary/history',
    '/api/finance/summary',
    '/api/finance/cycle',
    '/api/subscription',
    '/api/settings',
  ];

  await Promise.allSettled(
    endpoints.map(endpoint =>
      queryClient.prefetchQuery({
        queryKey: [endpoint],
        staleTime: 0,
      })
    )
  );
}

function useInitGeolocation() {
  const setLocation = useLocationStore((s) => s.setLocation);
  const setError = useLocationStore((s) => s.setError);
  const setWatching = useLocationStore((s) => s.setWatching);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada');
      return;
    }

    setWatching(true);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        let msg = 'Erro de localização';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Permissão negada';
        }
        setError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setWatching(false);
    };
  }, [setLocation, setError, setWatching]);
}

function useAuthCheck() {
  const setUser = useAuthStore((s) => s.setUser);
  const setSubscription = useAuthStore((s) => s.setSubscription);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            setUser(data.user);
            if (data.subscription) {
              setSubscription(data.subscription);
            }
            await prefetchAllData();
            setDataLoaded(true);
            return;
          }
        }
      } catch {
        // Ignore auth check errors
      }
      logout();
      setDataLoaded(true);
    };
    
    checkAuthAndLoadData();
  }, [setUser, setSubscription, logout]);

  return dataLoaded || !user;
}

function useSyncStops() {
  const setStops = useItineraryStore((s) => s.setStops);
  
  const { data } = useQuery<Stop[]>({
    queryKey: ['/api/stops'],
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data && Array.isArray(data)) {
      setStops(data);
    }
  }, [data, setStops]);
}

function useSyncSettings() {
  const setSettings = useSettingsStore((s) => s.setSettings);
  
  const { data } = useQuery<AccountSettings>({
    queryKey: ['/api/settings'],
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) {
      setSettings(data);
    }
  }, [data, setSettings]);
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!user) {
      setLocation('/login');
    }
  }, [user, setLocation]);

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

function RestoreLastPath() {
  const user = useAuthStore((s) => s.user);
  const lastPath = useNavigationStore((s) => s.lastPath);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) {
      const validPaths = ['/plan', '/drive', '/finance', '/settings'];
      const targetPath = validPaths.includes(lastPath) ? lastPath : '/plan';
      setLocation(targetPath);
    } else {
      setLocation('/login');
    }
  }, [user, lastPath, setLocation]);

  return null;
}

function AppContent() {
  useAuthCheck();
  useInitGeolocation();
  useSyncStops();
  useSyncSettings();
  const user = useAuthStore((s) => s.user);

  return (
    <Switch>
      <Route path="/login">
        {user ? <Redirect to="/plan" /> : <LoginPage />}
      </Route>

      <Route path="/signup">
        {user ? <Redirect to="/plan" /> : <SignupPage />}
      </Route>

      <Route path="/plan">
        <ProtectedRoute>
          <Layout>
            <PlanPage />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/drive">
        <ProtectedRoute>
          <Layout>
            <DrivePage />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/finance">
        <ProtectedRoute>
          <Layout>
            <FinancePage />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/settings">
        <ProtectedRoute>
          <Layout>
            <SettingsPage />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/street-planner">
        <ProtectedRoute>
          <Layout>
            <StreetPlanner />
          </Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/admin/login">
        <AdminLoginPage />
      </Route>

      <Route path="/admin/signup">
        <AdminSignupPage />
      </Route>

      <Route path="/admin/dashboard">
        <AdminDashboardPage />
      </Route>

      <Route>
        <RestoreLastPath />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

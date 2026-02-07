import { useState, useEffect } from 'react';

let googleMapsPromise: Promise<void> | null = null;
let isGoogleLoaded = false;
let loadAttempted = false;

async function loadGoogleMapsApi(): Promise<void> {
  if (isGoogleLoaded) return;
  if (loadAttempted && googleMapsPromise) return googleMapsPromise;
  
  loadAttempted = true;
  
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
  if (!apiKey) {
    throw new Error('VITE_GOOGLE_MAPS_API_KEY não está configurada');
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      isGoogleLoaded = true;
      resolve();
      return;
    }

    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        isGoogleLoaded = true;
        resolve();
      });
      existingScript.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&language=pt-BR&region=BR&callback=__googleMapsCallback`;
    script.async = true;
    script.defer = true;

    (window as any).__googleMapsCallback = () => {
      isGoogleLoaded = true;
      delete (window as any).__googleMapsCallback;
      resolve();
    };

    script.onerror = () => {
      reject(new Error('Falha ao carregar Google Maps API'));
    };

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export function useGoogleMaps() {
  const [isLoaded, setIsLoaded] = useState(isGoogleLoaded);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [google, setGoogle] = useState<typeof window.google | null>(
    isGoogleLoaded ? window.google : null
  );

  useEffect(() => {
    if (isGoogleLoaded && window.google) {
      setGoogle(window.google);
      setIsLoaded(true);
      return;
    }

    loadGoogleMapsApi()
      .then(() => {
        setGoogle(window.google);
        setIsLoaded(true);
      })
      .catch((error) => {
        console.error('Erro ao carregar Google Maps:', error);
        setLoadError(error);
      });
  }, []);

  return { isLoaded, loadError, google };
}

export function useGoogleMapsCallback(callback: (google: typeof window.google) => void) {
  const { isLoaded, google } = useGoogleMaps();

  useEffect(() => {
    if (isLoaded && google) {
      callback(google);
    }
  }, [isLoaded, google, callback]);

  return { isLoaded };
}

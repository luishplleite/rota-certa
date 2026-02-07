import { useState, useEffect, useCallback } from 'react';

interface WakeLockState {
  isSupported: boolean;
  isActive: boolean;
  request: () => Promise<void>;
  release: () => Promise<void>;
}

export function useWakeLock(): WakeLockState {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [isSupported] = useState(() => 'wakeLock' in navigator);
  const [isActive, setIsActive] = useState(false);

  const request = useCallback(async () => {
    if (!isSupported) {
      console.log('Wake Lock API not supported');
      return;
    }

    try {
      const lock = await navigator.wakeLock.request('screen');
      setWakeLock(lock);
      setIsActive(true);
      console.log('Wake Lock: Screen will stay on');

      lock.addEventListener('release', () => {
        setIsActive(false);
        console.log('Wake Lock: Released');
      });
    } catch (err) {
      console.error('Wake Lock request failed:', err);
    }
  }, [isSupported]);

  const release = useCallback(async () => {
    if (wakeLock) {
      await wakeLock.release();
      setWakeLock(null);
      setIsActive(false);
    }
  }, [wakeLock]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isActive && !wakeLock) {
        await request();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, wakeLock, request]);

  useEffect(() => {
    return () => {
      if (wakeLock) {
        wakeLock.release();
      }
    };
  }, [wakeLock]);

  return { isSupported, isActive, request, release };
}

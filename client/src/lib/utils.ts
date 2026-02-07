import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { StopStatus, Coordinates } from "@shared/schema";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}min`;
}

export function getNavigationUrl(
  coords: Coordinates,
  app: 'waze' | 'google_maps'
): string {
  const { latitude, longitude } = coords;
  
  if (app === 'waze') {
    return `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
  }
  
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
}

export function getStatusColor(status: StopStatus): string {
  const colors: Record<StopStatus, string> = {
    pending: 'hsl(217 91% 60%)',
    current: 'hsl(142 71% 45%)',
    delivered: 'hsl(215 16% 47%)',
    failed: 'hsl(0 84% 60%)',
  };
  return colors[status];
}

export function getStatusLabel(status: StopStatus): string {
  const labels: Record<StopStatus, string> = {
    pending: 'Pendente',
    current: 'Atual',
    delivered: 'Entregue',
    failed: 'Falha',
  };
  return labels[status];
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function playSound(type: 'success' | 'error'): void {
  if (typeof window === 'undefined') return;
  
  const frequencies = type === 'success' 
    ? [523.25, 659.25, 783.99]
    : [349.23, 311.13];
  
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    
    frequencies.forEach((freq, index) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';
      
      const startTime = audioContext.currentTime + index * 0.1;
      gainNode.gain.setValueAtTime(0.3, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.3);
    });
  } catch {
    // Ignore audio errors silently
  }
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

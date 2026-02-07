import { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Locate } from 'lucide-react';
import type { Stop } from '@shared/schema';
import { useLocationStore } from '@/lib/stores';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';

interface StartPoint {
  address: string;
  latitude: number;
  longitude: number;
}

interface DrawnSector {
  points: Array<{ lat: number; lng: number }>;
  stopIds: string[];
}

interface RouteMapProps {
  stops: Stop[];
  onStopClick?: (stop: Stop) => void;
  className?: string;
  startPoint?: StartPoint | null;
  drawnSectors?: DrawnSector[];
  sectorDrawingMode?: boolean;
  onSectorDrawn?: (points: Array<{ lat: number; lng: number }>) => void;
  navigatingToStopId?: string | null;
  showAllRoutes?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#3B82F6',
  current: '#22C55E',
  delivered: '#9CA3AF',
  failed: '#EF4444',
};

export function RouteMap({ 
  stops, 
  onStopClick, 
  className = '', 
  startPoint,
  drawnSectors = [],
  sectorDrawingMode = false,
  onSectorDrawn,
  navigatingToStopId = null,
  showAllRoutes = true,
}: RouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const startMarkerRef = useRef<google.maps.Marker | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const sectorPolygonsRef = useRef<google.maps.Polygon[]>([]);
  const drawingPolylineRef = useRef<google.maps.Polyline | null>(null);
  const drawingPointsRef = useRef<Array<{ lat: number; lng: number }>>([]);
  const onSectorDrawnRef = useRef(onSectorDrawn);
  const activeRoutePolylineRef = useRef<google.maps.Polyline | null>(null);
  const fullRoutePolylineRef = useRef<google.maps.Polyline | null>(null);
  const pendingRoutePolylineRef = useRef<google.maps.Polyline | null>(null);
  const staticRouteRequestIdRef = useRef(0);
  const activeRouteRequestIdRef = useRef(0);
  const pendingRouteRequestIdRef = useRef(0);
  const lastStopsHashRef = useRef<string>('');
  const lastMarkersHashRef = useRef<string>('');
  const lastStartPointHashRef = useRef<string>('');
  const mapJustLoadedRef = useRef(false);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const hasUserInteracted = useRef(false);
  const previousStopCount = useRef(0);
  const initialFitDoneRef = useRef(false);
  
  const userLocation = useLocationStore((s) => s.currentLocation);
  const { isLoaded: googleLoaded, loadError, google } = useGoogleMaps();

  // Initialize Google Map
  useEffect(() => {
    if (!mapContainer.current || map.current || !googleLoaded || !google) {
      return;
    }

    try {
      const defaultCenter = { lat: -23.9608, lng: -46.3333 };
      const initialCenter = userLocation 
        ? { lat: userLocation.latitude, lng: userLocation.longitude }
        : defaultCenter;

      map.current = new google.maps.Map(mapContainer.current, {
        center: initialCenter,
        zoom: 13,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy', // Allow single-finger drag on mobile
      });

      map.current.addListener('dragstart', () => {
        hasUserInteracted.current = true;
      });
      map.current.addListener('zoom_changed', () => {
        hasUserInteracted.current = true;
      });

      setMapLoaded(true);
      // Reset all hashes when map loads to force initial draw
      mapJustLoadedRef.current = true;
      lastMarkersHashRef.current = '';
      lastStartPointHashRef.current = '';
      lastStopsHashRef.current = '';
      // Reset initial fit flag so it will fit bounds on first data
      initialFitDoneRef.current = false;
    } catch (error) {
      console.error('Failed to initialize map:', error);
      setMapError('Mapa não disponível neste dispositivo');
    }

    return () => {
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
      if (userMarkerRef.current) userMarkerRef.current.setMap(null);
      if (startMarkerRef.current) startMarkerRef.current.setMap(null);
      if (routePolylineRef.current) routePolylineRef.current.setMap(null);
      if (activeRoutePolylineRef.current) activeRoutePolylineRef.current.setMap(null);
      if (fullRoutePolylineRef.current) fullRoutePolylineRef.current.setMap(null);
      if (pendingRoutePolylineRef.current) pendingRoutePolylineRef.current.setMap(null);
      sectorPolygonsRef.current.forEach(p => p.setMap(null));
      map.current = null;
    };
  }, [googleLoaded, google]);

  // Handle load error
  useEffect(() => {
    if (loadError) {
      setMapError('Erro ao carregar Google Maps: ' + loadError.message);
    }
  }, [loadError]);

  // Force fitBounds on initial load when map and stops are ready
  useEffect(() => {
    if (!map.current || !mapLoaded || !google || initialFitDoneRef.current) return;
    
    const validStops = stops.filter(stop => 
      stop.latitude !== 0 && stop.longitude !== 0
    );
    
    if (validStops.length === 0) return;
    
    // Small delay to ensure map is fully rendered
    const timer = setTimeout(() => {
      if (!map.current || initialFitDoneRef.current) return;
      
      const bounds = new google.maps.LatLngBounds();
      
      // Include start point if available
      if (startPoint) {
        bounds.extend({ lat: startPoint.latitude, lng: startPoint.longitude });
      } else if (userLocation) {
        bounds.extend({ lat: userLocation.latitude, lng: userLocation.longitude });
      }
      
      validStops.forEach(stop => {
        bounds.extend({ lat: stop.latitude, lng: stop.longitude });
      });

      map.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      initialFitDoneRef.current = true;
    }, 100);
    
    return () => clearTimeout(timer);
  }, [mapLoaded, stops, startPoint, userLocation, google]);

  // User location marker
  useEffect(() => {
    if (!map.current || !mapLoaded || !userLocation || !google) return;

    const userMarkerContent = document.createElement('div');
    userMarkerContent.innerHTML = `
      <div style="
        width: 20px;
        height: 20px;
        background-color: #4285F4;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.3), 0 2px 8px rgba(0,0,0,0.3);
        position: relative;
      ">
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 8px;
          height: 8px;
          background-color: white;
          border-radius: 50%;
        "></div>
      </div>
    `;

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition({ lat: userLocation.latitude, lng: userLocation.longitude });
    } else {
      userMarkerRef.current = new google.maps.Marker({
        map: map.current,
        position: { lat: userLocation.latitude, lng: userLocation.longitude },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#3B82F6',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 3,
        },
        title: 'Sua localização',
      });
    }
  }, [userLocation, mapLoaded, google]);

  // Start point marker - with hash check to avoid flickering
  useEffect(() => {
    if (!map.current || !mapLoaded || !google) return;

    // Create hash to detect actual changes
    const startPointHash = startPoint 
      ? `${startPoint.latitude}:${startPoint.longitude}:${startPoint.address}` 
      : '';
    
    // Skip if nothing changed
    if (startPointHash === lastStartPointHashRef.current) return;
    lastStartPointHashRef.current = startPointHash;

    if (startMarkerRef.current) {
      startMarkerRef.current.setMap(null);
      startMarkerRef.current = null;
    }

    if (!startPoint || !startPoint.latitude || !startPoint.longitude) return;

    startMarkerRef.current = new google.maps.Marker({
      map: map.current,
      position: { lat: startPoint.latitude, lng: startPoint.longitude },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: '#10B981',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 3,
      },
      title: startPoint.address,
      label: {
        text: 'I',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '12px',
      },
    });
  }, [startPoint, mapLoaded, google]);

  // Stop markers - with hash check to avoid flickering
  useEffect(() => {
    if (!map.current || !mapLoaded || !google) return;

    const validStops = stops.filter(stop => 
      stop.latitude !== 0 && stop.longitude !== 0
    );

    // Create hash to detect actual changes (include status for color changes)
    const markersHash = validStops.map(s => 
      `${s.id}:${s.latitude}:${s.longitude}:${s.status}:${s.sequenceOrder}`
    ).join('|');
    
    // Skip if nothing changed
    if (markersHash === lastMarkersHashRef.current) return;
    lastMarkersHashRef.current = markersHash;

    // Clear previous markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    validStops.forEach((stop, index) => {
      const color = STATUS_COLORS[stop.status] || STATUS_COLORS.pending;
      
      const marker = new google.maps.Marker({
        map: map.current,
        position: { lat: stop.latitude, lng: stop.longitude },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
        },
        label: {
          text: String(index + 1),
          color: 'white',
          fontWeight: 'bold',
          fontSize: '11px',
        },
        title: stop.addressFull,
      });

      if (onStopClick) {
        marker.addListener('click', () => {
          onStopClick(stop);
        });
      }

      markersRef.current.push(marker);
    });

    // Fit bounds - always do on initial load, then only when stops increase
    const currentStopCount = validStops.length;
    const isInitialFit = !initialFitDoneRef.current && validStops.length > 0;
    const shouldFitBounds = isInitialFit || 
      (!hasUserInteracted.current && currentStopCount > previousStopCount.current);
    
    if (validStops.length > 0 && shouldFitBounds) {
      const bounds = new google.maps.LatLngBounds();
      
      // Include start point if available
      if (startPoint) {
        bounds.extend({ lat: startPoint.latitude, lng: startPoint.longitude });
      } else if (userLocation) {
        bounds.extend({ lat: userLocation.latitude, lng: userLocation.longitude });
      }
      
      validStops.forEach(stop => {
        bounds.extend({ lat: stop.latitude, lng: stop.longitude });
      });

      map.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      initialFitDoneRef.current = true;
    }
    
    previousStopCount.current = currentStopCount;
  }, [stops, mapLoaded, onStopClick, userLocation, google, startPoint]);

  // Fetch real route from Google Directions API
  const fetchRealRoute = useCallback(async (coordinates: google.maps.LatLngLiteral[]): Promise<google.maps.LatLngLiteral[]> => {
    if (coordinates.length < 2) return coordinates;
    
    try {
      // Format: lon,lat;lon,lat;...
      const coordsStr = coordinates.map(c => `${c.lng},${c.lat}`).join(';');
      console.log('Fetching real route for:', coordsStr);
      const response = await fetch(`/api/route?coordinates=${encodeURIComponent(coordsStr)}`);
      
      if (!response.ok) {
        console.warn('Route API error, using straight lines');
        return coordinates;
      }
      
      const data = await response.json();
      console.log('Route API response:', data.routes?.length, 'routes,', data.routes?.[0]?.geometry?.coordinates?.length, 'points');
      
      if (data.routes && data.routes.length > 0 && data.routes[0].geometry?.coordinates) {
        // Convert from [lng, lat] to {lat, lng}
        const path = data.routes[0].geometry.coordinates.map((coord: [number, number]) => ({
          lat: coord[1],
          lng: coord[0]
        }));
        console.log('Returning real route with', path.length, 'points');
        return path;
      }
      
      console.warn('No valid route data, returning original coordinates');
      return coordinates;
    } catch (error) {
      console.warn('Failed to fetch real route:', error);
      return coordinates;
    }
  }, []);

  // Draw STATIC full route - only redraws when stops or startPoint changes
  useEffect(() => {
    if (!map.current || !mapLoaded || !google) return;

    const allStopsWithCoords = stops.filter(stop => 
      stop.latitude !== 0 && stop.longitude !== 0
    );

    // Create hash of stops to detect actual changes
    const stopsHash = allStopsWithCoords.map(s => `${s.id}:${s.latitude}:${s.longitude}:${s.sequenceOrder}`).join('|');
    const startHash = startPoint ? `${startPoint.latitude}:${startPoint.longitude}` : '';
    const currentHash = `${stopsHash}|${startHash}|${showAllRoutes}`;

    // Skip if nothing changed
    if (currentHash === lastStopsHashRef.current) return;
    lastStopsHashRef.current = currentHash;

    const requestId = ++staticRouteRequestIdRef.current;

    // Clear previous static route only
    if (fullRoutePolylineRef.current) {
      fullRoutePolylineRef.current.setMap(null);
      fullRoutePolylineRef.current = null;
    }
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    const hasStartPoint = startPoint && startPoint.latitude && startPoint.longitude;
    if (allStopsWithCoords.length < 1) return;

    const drawStaticRoute = async () => {
      const coordinates: google.maps.LatLngLiteral[] = [];
      
      if (hasStartPoint) {
        coordinates.push({ lat: startPoint.latitude, lng: startPoint.longitude });
      }
      
      allStopsWithCoords.forEach(s => {
        coordinates.push({ lat: s.latitude, lng: s.longitude });
      });

      if (coordinates.length < 2) return;

      // Fetch real route for entire path
      const realRoutePath = await fetchRealRoute(coordinates);
      
      // Check if this request is still current
      if (requestId !== staticRouteRequestIdRef.current || !map.current) return;

      // Draw full route (light gray background - static reference)
      if (showAllRoutes) {
        fullRoutePolylineRef.current = new google.maps.Polyline({
          path: realRoutePath,
          strokeColor: '#9CA3AF',
          strokeWeight: 3,
          strokeOpacity: 0.4,
          map: map.current,
          zIndex: 1,
        });
      }
    };

    drawStaticRoute();
  }, [stops, mapLoaded, startPoint, google, showAllRoutes, fetchRealRoute]);

  // Draw ACTIVE navigation segment - updates when navigating or user moves (ONLY the green segment)
  // Uses throttling to prevent flickering on mobile devices
  const lastActiveUpdateRef = useRef<number>(0);
  const activeUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!map.current || !mapLoaded || !google) return;

    // Only draw active segment when navigating
    if (!navigatingToStopId || !userLocation) {
      // Clear polyline when not navigating
      if (activeRoutePolylineRef.current) {
        activeRoutePolylineRef.current.setMap(null);
        activeRoutePolylineRef.current = null;
      }
      return;
    }

    const allStopsWithCoords = stops.filter(stop => 
      stop.latitude !== 0 && stop.longitude !== 0
    );

    if (allStopsWithCoords.length < 1) return;

    const currentStopIndex = allStopsWithCoords.findIndex(s => s.id === navigatingToStopId);
    if (currentStopIndex < 0) return;

    const currentCoord = { 
      lat: allStopsWithCoords[currentStopIndex].latitude, 
      lng: allStopsWithCoords[currentStopIndex].longitude 
    };

    // Throttle updates to prevent flickering - max once per 3 seconds
    const now = Date.now();
    const timeSinceLastUpdate = now - lastActiveUpdateRef.current;
    const THROTTLE_MS = 3000;

    const updateRoute = async () => {
      const requestId = ++activeRouteRequestIdRef.current;
      lastActiveUpdateRef.current = Date.now();
      
      const activeCoords: google.maps.LatLngLiteral[] = [
        { lat: userLocation.latitude, lng: userLocation.longitude },
        currentCoord
      ];

      const activeRealPath = await fetchRealRoute(activeCoords);
      
      // Check if this request is still current
      if (requestId !== activeRouteRequestIdRef.current || !map.current) return;
      
      // Update existing polyline path instead of recreating
      if (activeRoutePolylineRef.current) {
        activeRoutePolylineRef.current.setPath(activeRealPath);
      } else {
        activeRoutePolylineRef.current = new google.maps.Polyline({
          path: activeRealPath,
          strokeColor: '#22C55E',
          strokeWeight: 6,
          strokeOpacity: 1,
          map: map.current,
          zIndex: 10,
        });
      }
    };

    // If enough time has passed, update immediately
    if (timeSinceLastUpdate >= THROTTLE_MS) {
      updateRoute();
    } else {
      // Otherwise schedule an update for later
      if (activeUpdateTimeoutRef.current) {
        clearTimeout(activeUpdateTimeoutRef.current);
      }
      activeUpdateTimeoutRef.current = setTimeout(updateRoute, THROTTLE_MS - timeSinceLastUpdate);
    }

    return () => {
      if (activeUpdateTimeoutRef.current) {
        clearTimeout(activeUpdateTimeoutRef.current);
      }
    };
  }, [navigatingToStopId, userLocation, stops, mapLoaded, google, fetchRealRoute]);

  // Draw PENDING route segments - only updates when stops or navigating stop changes (NOT on user location change)
  useEffect(() => {
    if (!map.current || !mapLoaded || !google) return;

    const requestId = ++pendingRouteRequestIdRef.current;

    // Clear previous pending route
    if (pendingRoutePolylineRef.current) {
      pendingRoutePolylineRef.current.setMap(null);
      pendingRoutePolylineRef.current = null;
    }

    const allStopsWithCoords = stops.filter(stop => 
      stop.latitude !== 0 && stop.longitude !== 0
    );

    if (allStopsWithCoords.length < 1) return;

    const hasStartPoint = startPoint && startPoint.latitude && startPoint.longitude;

    // Find current stop index
    const currentStopIndex = navigatingToStopId 
      ? allStopsWithCoords.findIndex(s => s.id === navigatingToStopId)
      : allStopsWithCoords.findIndex(s => s.status === 'current' || s.status === 'pending');

    if (currentStopIndex < 0) return;

    const drawPendingSegments = async () => {
      // Build the full pending route including start point
      const pendingCoords: google.maps.LatLngLiteral[] = [];
      
      // If not actively navigating to a specific stop, include start point
      if (!navigatingToStopId && hasStartPoint) {
        pendingCoords.push({ lat: startPoint.latitude, lng: startPoint.longitude });
      }
      
      // Add all stops from current index onwards
      allStopsWithCoords.forEach((s, idx) => {
        if (idx >= currentStopIndex && (s.status === 'pending' || s.status === 'current')) {
          pendingCoords.push({ lat: s.latitude, lng: s.longitude });
        }
      });

      if (pendingCoords.length < 2) return;

      const pendingRealPath = await fetchRealRoute(pendingCoords);
      
      // Check if this request is still current
      if (requestId !== pendingRouteRequestIdRef.current || !map.current) return;

      pendingRoutePolylineRef.current = new google.maps.Polyline({
        path: pendingRealPath,
        strokeColor: '#3B82F6',
        strokeWeight: 4,
        strokeOpacity: 0.7,
        map: map.current,
        zIndex: 5,
      });
    };

    drawPendingSegments();
  }, [navigatingToStopId, stops, mapLoaded, google, startPoint, fetchRealRoute]);

  // Render drawn sectors
  useEffect(() => {
    if (!map.current || !mapLoaded || !google) return;

    // Clear previous polygons
    sectorPolygonsRef.current.forEach(polygon => polygon.setMap(null));
    sectorPolygonsRef.current = [];

    // Draw each sector
    drawnSectors.forEach((sector, index) => {
      if (sector.points.length < 3) return;
      const sectorColor = `hsl(${(index * 60) % 360}, 70%, 50%)`;
      
      const polygon = new google.maps.Polygon({
        paths: sector.points,
        strokeColor: sectorColor,
        strokeWeight: 2,
        fillColor: sectorColor,
        fillOpacity: 0.2,
        map: map.current,
      });
      sectorPolygonsRef.current.push(polygon);
    });
  }, [drawnSectors, mapLoaded, google]);

  // Handle sector drawing mode (supports both mouse and touch events)
  useEffect(() => {
    if (!map.current || !mapLoaded || !google) return;

    const mapInstance = map.current;
    const mapDiv = mapInstance.getDiv();

    if (sectorDrawingMode) {
      mapInstance.setOptions({ draggable: false, scrollwheel: false, disableDoubleClickZoom: true, gestureHandling: 'none' });

      let isDrawing = false;
      let startMarker: google.maps.Marker | null = null;
      
      // Calculate distance between two points in pixels (approximate)
      const getDistanceInPixels = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number => {
        const bounds = mapInstance.getBounds();
        if (!bounds) return Infinity;
        
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const mapRect = mapDiv.getBoundingClientRect();
        
        // Convert lat/lng to relative pixel positions
        const x1 = ((p1.lng - sw.lng()) / (ne.lng() - sw.lng())) * mapRect.width;
        const y1 = ((ne.lat() - p1.lat) / (ne.lat() - sw.lat())) * mapRect.height;
        const x2 = ((p2.lng - sw.lng()) / (ne.lng() - sw.lng())) * mapRect.width;
        const y2 = ((ne.lat() - p2.lat) / (ne.lat() - sw.lat())) * mapRect.height;
        
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      };

      const startDrawing = (lat: number, lng: number) => {
        isDrawing = true;
        drawingPointsRef.current = [{ lat, lng }];
        
        // Create a visible marker at start point to show where to close
        startMarker = new google.maps.Marker({
          position: { lat, lng },
          map: mapInstance,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#22C55E',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 3,
          },
          zIndex: 1000,
        });
      };

      const continueDrawing = (lat: number, lng: number) => {
        if (!isDrawing || drawingPointsRef.current.length === 0) return;
        
        drawingPointsRef.current.push({ lat, lng });

        if (drawingPolylineRef.current) {
          drawingPolylineRef.current.setPath(drawingPointsRef.current);
        } else {
          drawingPolylineRef.current = new google.maps.Polyline({
            path: drawingPointsRef.current,
            strokeColor: '#EF4444',
            strokeWeight: 6,
            strokeOpacity: 0.9,
            map: mapInstance,
          });
        }
        
        // Check if current point is close to start point (auto-close)
        const startPoint = drawingPointsRef.current[0];
        const currentPoint = { lat, lng };
        const distance = getDistanceInPixels(startPoint, currentPoint);
        
        // If we have enough points and are close to start (within 40px), auto-close
        if (drawingPointsRef.current.length > 10 && distance < 40) {
          // Change polyline color to indicate it will close
          if (drawingPolylineRef.current) {
            drawingPolylineRef.current.setOptions({ strokeColor: '#22C55E' });
          }
        } else if (drawingPolylineRef.current) {
          drawingPolylineRef.current.setOptions({ strokeColor: '#EF4444' });
        }
      };

      const endDrawing = () => {
        if (!isDrawing) return;
        isDrawing = false;

        // Clean up start marker
        if (startMarker) {
          startMarker.setMap(null);
          startMarker = null;
        }

        if (drawingPointsRef.current.length < 3) {
          cleanupDrawing();
          return;
        }

        // Check if end point is close to start point - if so, close the polygon
        const startPoint = drawingPointsRef.current[0];
        const endPoint = drawingPointsRef.current[drawingPointsRef.current.length - 1];
        const distance = getDistanceInPixels(startPoint, endPoint);
        
        // Auto-close if within 60 pixels of start point
        if (distance < 60) {
          // Add the start point to close the polygon
          drawingPointsRef.current.push({ ...startPoint });
        }

        const simplifiedPoints = drawingPointsRef.current.filter((_, i) => 
          i % 3 === 0 || i === drawingPointsRef.current.length - 1
        );
        
        if (simplifiedPoints.length >= 3 && onSectorDrawnRef.current) {
          onSectorDrawnRef.current(simplifiedPoints);
        }

        cleanupDrawing();
      };

      const cleanupDrawing = () => {
        isDrawing = false;
        drawingPointsRef.current = [];
        if (drawingPolylineRef.current) {
          drawingPolylineRef.current.setMap(null);
          drawingPolylineRef.current = null;
        }
        if (startMarker) {
          startMarker.setMap(null);
          startMarker = null;
        }
      };

      // Convert screen coordinates to map coordinates
      const screenToLatLng = (x: number, y: number): { lat: number; lng: number } | null => {
        const bounds = mapInstance.getBounds();
        const projection = mapInstance.getProjection();
        if (!bounds || !projection) return null;

        const mapRect = mapDiv.getBoundingClientRect();
        const relX = x - mapRect.left;
        const relY = y - mapRect.top;

        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        
        const lng = sw.lng() + (relX / mapRect.width) * (ne.lng() - sw.lng());
        const lat = ne.lat() - (relY / mapRect.height) * (ne.lat() - sw.lat());

        return { lat, lng };
      };

      // Mouse event handlers
      const handleMouseDown = (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        startDrawing(e.latLng.lat(), e.latLng.lng());
      };

      const handleMouseMove = (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        continueDrawing(e.latLng.lat(), e.latLng.lng());
      };

      const handleMouseUp = () => {
        endDrawing();
      };

      // Touch event handlers
      const handleTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const coords = screenToLatLng(touch.clientX, touch.clientY);
        if (coords) startDrawing(coords.lat, coords.lng);
      };

      const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        const coords = screenToLatLng(touch.clientX, touch.clientY);
        if (coords) continueDrawing(coords.lat, coords.lng);
      };

      const handleTouchEnd = (e: TouchEvent) => {
        e.preventDefault();
        endDrawing();
      };

      const handleTouchCancel = () => {
        cleanupDrawing();
      };

      // Add mouse listeners via Google Maps API
      const mouseDownListener = mapInstance.addListener('mousedown', handleMouseDown);
      const mouseMoveListener = mapInstance.addListener('mousemove', handleMouseMove);
      const mouseUpListener = mapInstance.addListener('mouseup', handleMouseUp);

      // Add touch listeners directly to DOM element
      mapDiv.addEventListener('touchstart', handleTouchStart, { passive: false });
      mapDiv.addEventListener('touchmove', handleTouchMove, { passive: false });
      mapDiv.addEventListener('touchend', handleTouchEnd, { passive: false });
      mapDiv.addEventListener('touchcancel', handleTouchCancel);

      return () => {
        google.maps.event.removeListener(mouseDownListener);
        google.maps.event.removeListener(mouseMoveListener);
        google.maps.event.removeListener(mouseUpListener);
        mapDiv.removeEventListener('touchstart', handleTouchStart);
        mapDiv.removeEventListener('touchmove', handleTouchMove);
        mapDiv.removeEventListener('touchend', handleTouchEnd);
        mapDiv.removeEventListener('touchcancel', handleTouchCancel);
        mapInstance.setOptions({ draggable: true, scrollwheel: true, disableDoubleClickZoom: false, gestureHandling: 'greedy' });
        cleanupDrawing();
      };
    } else {
      mapInstance.setOptions({ draggable: true, scrollwheel: true, disableDoubleClickZoom: false, gestureHandling: 'greedy' });
    }
  }, [sectorDrawingMode, mapLoaded, google]);
  
  // Keep the ref updated
  useEffect(() => {
    onSectorDrawnRef.current = onSectorDrawn;
  }, [onSectorDrawn]);

  if (mapError) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{mapError}</p>
          <p className="text-xs text-muted-foreground">
            {stops.length} parada{stops.length !== 1 ? 's' : ''} na rota
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-muted ${className}`} style={{ minHeight: '200px' }}>
      <div 
        ref={mapContainer} 
        className="google-map"
        style={{ 
          width: '100%', 
          height: '100%', 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0 
        }} 
      />
      {(!mapLoaded || !googleLoaded) && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Carregando mapa...</span>
          </div>
        </div>
      )}
      
      {/* Center on location button */}
      {mapLoaded && userLocation && (
        <button
          onClick={() => {
            if (map.current && userLocation) {
              map.current.panTo({ lat: userLocation.latitude, lng: userLocation.longitude });
              map.current.setZoom(16);
              hasUserInteracted.current = false;
            }
          }}
          className="absolute bottom-4 right-4 z-20 bg-white dark:bg-gray-800 rounded-full p-3 shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label="Centralizar no dispositivo"
          data-testid="button-center-location"
        >
          <Locate className="h-5 w-5 text-blue-500" />
        </button>
      )}
    </div>
  );
}

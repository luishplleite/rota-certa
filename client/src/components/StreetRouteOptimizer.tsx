import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  RotateCcw, 
  ArrowUpDown, 
  Car, 
  Footprints,
  MapPin,
  Route,
  CheckCircle2,
  Settings2
} from 'lucide-react';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';

interface StreetSegment {
  id: string;
  name: string;
  side: 'left' | 'right';
  direction: 'up' | 'down';
  coordinates: { lat: number; lng: number }[];
  color: string;
  distance: number;
  mode: 'car' | 'walk';
  order: number | null;
  polyline?: google.maps.Polyline;
}

interface DeliveryPoint {
  id: string;
  segmentId: string;
  position: { lat: number; lng: number };
  address: string;
  order: number | null;
  marker?: google.maps.Marker;
  packages: number;
}

const SANTOS_CENTER = { lat: -23.9608, lng: -46.3308 };

const AV_ANA_COSTA_SEGMENTS: Omit<StreetSegment, 'distance' | 'polyline'>[] = [
  {
    id: 'left_up',
    name: 'Av. Ana Costa - Esquerda (Sentido Centro)',
    side: 'left',
    direction: 'up',
    coordinates: [
      { lat: -23.9650, lng: -46.3295 },
      { lat: -23.9635, lng: -46.3300 },
      { lat: -23.9620, lng: -46.3305 },
      { lat: -23.9605, lng: -46.3310 },
      { lat: -23.9590, lng: -46.3315 },
      { lat: -23.9575, lng: -46.3320 },
    ],
    color: '#3B82F6',
    mode: 'car',
    order: null
  },
  {
    id: 'left_down',
    name: 'Av. Ana Costa - Esquerda (Sentido Praia)',
    side: 'left',
    direction: 'down',
    coordinates: [
      { lat: -23.9575, lng: -46.3318 },
      { lat: -23.9590, lng: -46.3313 },
      { lat: -23.9605, lng: -46.3308 },
      { lat: -23.9620, lng: -46.3303 },
      { lat: -23.9635, lng: -46.3298 },
      { lat: -23.9650, lng: -46.3293 },
    ],
    color: '#60A5FA',
    mode: 'car',
    order: null
  },
  {
    id: 'right_up',
    name: 'Av. Ana Costa - Direita (Sentido Centro)',
    side: 'right',
    direction: 'up',
    coordinates: [
      { lat: -23.9650, lng: -46.3290 },
      { lat: -23.9635, lng: -46.3295 },
      { lat: -23.9620, lng: -46.3300 },
      { lat: -23.9605, lng: -46.3305 },
      { lat: -23.9590, lng: -46.3310 },
      { lat: -23.9575, lng: -46.3315 },
    ],
    color: '#22C55E',
    mode: 'car',
    order: null
  },
  {
    id: 'right_down',
    name: 'Av. Ana Costa - Direita (Sentido Praia)',
    side: 'right',
    direction: 'down',
    coordinates: [
      { lat: -23.9575, lng: -46.3313 },
      { lat: -23.9590, lng: -46.3308 },
      { lat: -23.9605, lng: -46.3303 },
      { lat: -23.9620, lng: -46.3298 },
      { lat: -23.9635, lng: -46.3293 },
      { lat: -23.9650, lng: -46.3288 },
    ],
    color: '#4ADE80',
    mode: 'car',
    order: null
  }
];

const SAMPLE_DELIVERY_POINTS: Omit<DeliveryPoint, 'marker'>[] = [
  { id: 'p1', segmentId: 'left_up', position: { lat: -23.9640, lng: -46.3298 }, address: 'Av. Ana Costa, 150', order: null, packages: 2 },
  { id: 'p2', segmentId: 'left_up', position: { lat: -23.9610, lng: -46.3308 }, address: 'Av. Ana Costa, 280', order: null, packages: 1 },
  { id: 'p3', segmentId: 'right_up', position: { lat: -23.9625, lng: -46.3298 }, address: 'Av. Ana Costa, 201', order: null, packages: 3 },
  { id: 'p4', segmentId: 'right_down', position: { lat: -23.9600, lng: -46.3305 }, address: 'Av. Ana Costa, 350', order: null, packages: 1 },
  { id: 'p5', segmentId: 'left_down', position: { lat: -23.9615, lng: -46.3305 }, address: 'Av. Ana Costa, 265', order: null, packages: 2 },
];

export default function StreetRouteOptimizer() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  
  const [segments, setSegments] = useState<StreetSegment[]>([]);
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [optimizedRoute, setOptimizedRoute] = useState<DeliveryPoint[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [totalDistance, setTotalDistance] = useState(0);
  const [walkDistance, setWalkDistance] = useState(0);
  const [carDistance, setCarDistance] = useState(0);
  const [mapLoaded, setMapLoaded] = useState(false);

  const { isLoaded: googleLoaded, google } = useGoogleMaps();

  const calculateDistance = useCallback((coords: { lat: number; lng: number }[]): number => {
    if (!google) return 0;
    let total = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = new google.maps.LatLng(coords[i].lat, coords[i].lng);
      const p2 = new google.maps.LatLng(coords[i + 1].lat, coords[i + 1].lng);
      total += google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
    }
    return total;
  }, [google]);

  const initializeMap = useCallback(() => {
    if (!mapContainerRef.current || mapRef.current || !googleLoaded || !google) return;

    const map = new google.maps.Map(mapContainerRef.current, {
      center: SANTOS_CENTER,
      zoom: 16,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    mapRef.current = map;

    const initialSegments: StreetSegment[] = AV_ANA_COSTA_SEGMENTS.map(seg => {
      const distance = calculateDistance(seg.coordinates);
      const polyline = new google.maps.Polyline({
        path: seg.coordinates,
        strokeColor: seg.color,
        strokeWeight: 6,
        strokeOpacity: 0.8,
        map: map,
        clickable: true,
      });

      polyline.addListener('click', () => {
        toggleSegmentSelection(seg.id);
      });

      return {
        ...seg,
        distance,
        polyline
      };
    });

    setSegments(initialSegments);

    const initialPoints: DeliveryPoint[] = SAMPLE_DELIVERY_POINTS.map(point => {
      const marker = new google.maps.Marker({
        map: map,
        position: point.position,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: '#EF4444',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
        },
        label: {
          text: String(point.packages),
          color: 'white',
          fontWeight: 'bold',
          fontSize: '12px',
        },
        title: `${point.address} (${point.packages} pacotes)`,
      });

      return {
        ...point,
        marker
      };
    });

    setDeliveryPoints(initialPoints);
    setMapLoaded(true);
  }, [googleLoaded, google, calculateDistance]);

  const toggleSegmentSelection = useCallback((segmentId: string) => {
    setSelectedSegments(prev => {
      if (prev.includes(segmentId)) {
        return prev.filter(id => id !== segmentId);
      }
      return [...prev, segmentId];
    });
  }, []);

  useEffect(() => {
    segments.forEach(seg => {
      if (seg.polyline) {
        const isSelected = selectedSegments.includes(seg.id);
        seg.polyline.setOptions({
          strokeWeight: isSelected ? 10 : 6,
          strokeOpacity: isSelected ? 1 : 0.6
        });
      }
    });
  }, [selectedSegments, segments]);

  const optimizeRoute = useCallback(async () => {
    if (selectedSegments.length === 0 || !google) return;

    setIsOptimizing(true);

    const pointsInSelectedSegments = deliveryPoints.filter(p => 
      selectedSegments.includes(p.segmentId)
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    const optimized = [...pointsInSelectedSegments].sort((a, b) => {
      const segA = segments.find(s => s.id === a.segmentId);
      const segB = segments.find(s => s.id === b.segmentId);
      
      if (!segA || !segB) return 0;

      if (segA.side !== segB.side) {
        return segA.side === 'left' ? -1 : 1;
      }

      if (segA.direction !== segB.direction) {
        return segA.direction === 'up' ? -1 : 1;
      }

      return a.position.lat - b.position.lat;
    });

    optimized.forEach((point, index) => {
      point.order = index + 1;
      
      if (point.marker) {
        point.marker.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: '#22C55E',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 3,
        });
        point.marker.setLabel({
          text: String(index + 1),
          color: 'white',
          fontWeight: 'bold',
          fontSize: '14px',
        });
      }
    });

    setOptimizedRoute(optimized);

    if (routePolylineRef.current && mapRef.current) {
      routePolylineRef.current.setMap(null);
    }

    if (optimized.length > 1 && mapRef.current) {
      const routeCoords = optimized.map(p => p.position);
      
      const lineSymbol = {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        scale: 3,
      };
      
      routePolylineRef.current = new google.maps.Polyline({
        path: routeCoords,
        strokeColor: '#8B5CF6',
        strokeWeight: 0,
        strokeOpacity: 0,
        icons: [{
          icon: lineSymbol,
          offset: '0',
          repeat: '15px',
        }],
        map: mapRef.current,
      });
    }

    let total = 0;
    let walk = 0;
    let car = 0;

    for (let i = 0; i < optimized.length - 1; i++) {
      const p1 = new google.maps.LatLng(optimized[i].position.lat, optimized[i].position.lng);
      const p2 = new google.maps.LatLng(optimized[i + 1].position.lat, optimized[i + 1].position.lng);
      const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
      total += dist;
      
      if (dist < 100) {
        walk += dist;
      } else {
        car += dist;
      }
    }

    setTotalDistance(total);
    setWalkDistance(walk);
    setCarDistance(car);

    setIsOptimizing(false);
  }, [selectedSegments, deliveryPoints, segments, google]);

  const invertRoute = useCallback(() => {
    if (optimizedRoute.length === 0 || !google) return;

    const inverted = [...optimizedRoute].reverse();
    inverted.forEach((point, index) => {
      point.order = index + 1;
      
      if (point.marker) {
        point.marker.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: '#22C55E',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 3,
        });
        point.marker.setLabel({
          text: String(index + 1),
          color: 'white',
          fontWeight: 'bold',
          fontSize: '14px',
        });
      }
    });

    setOptimizedRoute(inverted);

    if (routePolylineRef.current && mapRef.current) {
      routePolylineRef.current.setMap(null);
      const routeCoords = inverted.map(p => p.position);
      
      const lineSymbol = {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        scale: 3,
      };
      
      routePolylineRef.current = new google.maps.Polyline({
        path: routeCoords,
        strokeColor: '#8B5CF6',
        strokeWeight: 0,
        strokeOpacity: 0,
        icons: [{
          icon: lineSymbol,
          offset: '0',
          repeat: '15px',
        }],
        map: mapRef.current,
      });
    }
  }, [optimizedRoute, google]);

  const resetRoute = useCallback(() => {
    if (!google) return;
    
    setOptimizedRoute([]);
    setSelectedSegments([]);
    setTotalDistance(0);
    setWalkDistance(0);
    setCarDistance(0);

    if (routePolylineRef.current && mapRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    deliveryPoints.forEach(point => {
      if (point.marker) {
        point.marker.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: '#EF4444',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
        });
        point.marker.setLabel({
          text: String(point.packages),
          color: 'white',
          fontWeight: 'bold',
          fontSize: '12px',
        });
      }
      point.order = null;
    });

    segments.forEach(seg => {
      if (seg.polyline) {
        seg.polyline.setOptions({
          strokeWeight: 6,
          strokeOpacity: 0.8
        });
      }
    });
  }, [deliveryPoints, segments, google]);

  useEffect(() => {
    initializeMap();

    return () => {
      segments.forEach(seg => {
        if (seg.polyline) seg.polyline.setMap(null);
      });
      deliveryPoints.forEach(point => {
        if (point.marker) point.marker.setMap(null);
      });
      if (routePolylineRef.current) routePolylineRef.current.setMap(null);
      mapRef.current = null;
    };
  }, [initializeMap]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between p-4 border-b bg-card" data-testid="header-street-planner">
        <div className="flex items-center gap-2">
          <Route className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-semibold" data-testid="text-title">Roteirizador de Ruas</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1" data-testid="badge-location">
            <MapPin className="w-3 h-3" />
            Santos/SP
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 border-r bg-card overflow-y-auto">
          <div className="p-4 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  Segmentos da Rua
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {segments.map(seg => (
                  <button
                    key={seg.id}
                    onClick={() => toggleSegmentSelection(seg.id)}
                    className={`w-full p-2 rounded-md text-left text-sm transition-colors ${
                      selectedSegments.includes(seg.id)
                        ? 'bg-primary/20 border-2 border-primary'
                        : 'bg-muted hover-elevate'
                    }`}
                    data-testid={`segment-${seg.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="font-medium">
                        {seg.side === 'left' ? 'Esquerda' : 'Direita'} - {seg.direction === 'up' ? 'Subindo' : 'Descendo'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {Math.round(seg.distance)}m
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Acoes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full"
                  onClick={optimizeRoute}
                  disabled={selectedSegments.length === 0 || isOptimizing || !googleLoaded}
                  data-testid="button-optimize"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {isOptimizing ? 'Otimizando...' : 'Otimizar Rota'}
                </Button>
                
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={invertRoute}
                  disabled={optimizedRoute.length === 0}
                  data-testid="button-invert"
                >
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  Inverter Rota
                </Button>

                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={resetRoute}
                  data-testid="button-reset"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Limpar
                </Button>
              </CardContent>
            </Card>

            {optimizedRoute.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Rota Otimizada
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-1" data-testid="stat-car-distance">
                        <Car className="w-4 h-4 text-blue-500" />
                        <span>{Math.round(carDistance)}m</span>
                      </div>
                      <div className="flex items-center gap-1" data-testid="stat-walk-distance">
                        <Footprints className="w-4 h-4 text-orange-500" />
                        <span>{Math.round(walkDistance)}m</span>
                      </div>
                    </div>
                    <div className="text-sm font-medium" data-testid="stat-total-distance">
                      Total: {Math.round(totalDistance)}m
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto" data-testid="list-optimized-route">
                      {optimizedRoute.map((point, index) => (
                        <div
                          key={point.id}
                          className="flex items-center gap-2 p-2 bg-muted rounded text-sm"
                          data-testid={`route-stop-${point.id}`}
                        >
                          <Badge variant="secondary" className="w-6 h-6 p-0 flex items-center justify-center" data-testid={`badge-order-${point.id}`}>
                            {index + 1}
                          </Badge>
                          <span className="truncate" data-testid={`text-address-${point.id}`}>{point.address}</span>
                          <Badge variant="outline" className="ml-auto" data-testid={`badge-packages-${point.id}`}>
                            {point.packages}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="flex-1 relative">
          <div
            ref={mapContainerRef}
            className="absolute inset-0"
            data-testid="street-route-map"
          />
          {(!mapLoaded || !googleLoaded) && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">Carregando mapa...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

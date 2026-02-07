export interface CityBounds {
  id: string;
  name: string;
  state: string;
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  center: {
    lat: number;
    lng: number;
  };
}

export const BRAZILIAN_CITIES: CityBounds[] = [
  {
    id: 'santos-sp',
    name: 'Santos',
    state: 'SP',
    bounds: { south: -24.02, west: -46.45, north: -23.90, east: -46.28 },
    center: { lat: -23.9608, lng: -46.3333 }
  },
  {
    id: 'sao-vicente-sp',
    name: 'Sao Vicente',
    state: 'SP',
    bounds: { south: -24.05, west: -46.45, north: -23.92, east: -46.35 },
    center: { lat: -23.9634, lng: -46.3917 }
  },
  {
    id: 'guaruja-sp',
    name: 'Guaruja',
    state: 'SP',
    bounds: { south: -24.05, west: -46.32, north: -23.85, east: -46.18 },
    center: { lat: -23.9933, lng: -46.2567 }
  },
  {
    id: 'praia-grande-sp',
    name: 'Praia Grande',
    state: 'SP',
    bounds: { south: -24.08, west: -46.55, north: -23.98, east: -46.38 },
    center: { lat: -24.0058, lng: -46.4022 }
  },
  {
    id: 'cubatao-sp',
    name: 'Cubatao',
    state: 'SP',
    bounds: { south: -23.95, west: -46.48, north: -23.82, east: -46.35 },
    center: { lat: -23.8953, lng: -46.4253 }
  },
  {
    id: 'sao-paulo-sp',
    name: 'Sao Paulo',
    state: 'SP',
    bounds: { south: -24.00, west: -46.85, north: -23.35, east: -46.35 },
    center: { lat: -23.5505, lng: -46.6333 }
  },
  {
    id: 'campinas-sp',
    name: 'Campinas',
    state: 'SP',
    bounds: { south: -23.10, west: -47.20, north: -22.75, east: -46.90 },
    center: { lat: -22.9099, lng: -47.0626 }
  },
  {
    id: 'rio-de-janeiro-rj',
    name: 'Rio de Janeiro',
    state: 'RJ',
    bounds: { south: -23.10, west: -43.80, north: -22.75, east: -43.10 },
    center: { lat: -22.9068, lng: -43.1729 }
  },
  {
    id: 'belo-horizonte-mg',
    name: 'Belo Horizonte',
    state: 'MG',
    bounds: { south: -20.10, west: -44.10, north: -19.75, east: -43.85 },
    center: { lat: -19.9167, lng: -43.9345 }
  },
  {
    id: 'curitiba-pr',
    name: 'Curitiba',
    state: 'PR',
    bounds: { south: -25.65, west: -49.45, north: -25.30, east: -49.15 },
    center: { lat: -25.4284, lng: -49.2733 }
  },
  {
    id: 'porto-alegre-rs',
    name: 'Porto Alegre',
    state: 'RS',
    bounds: { south: -30.30, west: -51.30, north: -29.95, east: -51.05 },
    center: { lat: -30.0346, lng: -51.2177 }
  },
  {
    id: 'salvador-ba',
    name: 'Salvador',
    state: 'BA',
    bounds: { south: -13.05, west: -38.55, north: -12.85, east: -38.30 },
    center: { lat: -12.9714, lng: -38.5014 }
  },
  {
    id: 'fortaleza-ce',
    name: 'Fortaleza',
    state: 'CE',
    bounds: { south: -3.90, west: -38.70, north: -3.68, east: -38.40 },
    center: { lat: -3.7172, lng: -38.5433 }
  },
  {
    id: 'recife-pe',
    name: 'Recife',
    state: 'PE',
    bounds: { south: -8.20, west: -35.05, north: -7.95, east: -34.85 },
    center: { lat: -8.0476, lng: -34.8770 }
  },
  {
    id: 'brasilia-df',
    name: 'Brasilia',
    state: 'DF',
    bounds: { south: -16.05, west: -48.10, north: -15.50, east: -47.35 },
    center: { lat: -15.7801, lng: -47.9292 }
  },
  {
    id: 'manaus-am',
    name: 'Manaus',
    state: 'AM',
    bounds: { south: -3.20, west: -60.15, north: -2.90, east: -59.85 },
    center: { lat: -3.1190, lng: -60.0217 }
  },
  {
    id: 'goiania-go',
    name: 'Goiania',
    state: 'GO',
    bounds: { south: -16.85, west: -49.45, north: -16.55, east: -49.15 },
    center: { lat: -16.6869, lng: -49.2648 }
  },
  {
    id: 'florianopolis-sc',
    name: 'Florianopolis',
    state: 'SC',
    bounds: { south: -27.85, west: -48.65, north: -27.35, east: -48.35 },
    center: { lat: -27.5954, lng: -48.5480 }
  }
];

export function lon2tile(lon: number, zoom: number): number {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

export function lat2tile(lat: number, zoom: number): number {
  return Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
  );
}

export function getTilesForBounds(
  bounds: { south: number; west: number; north: number; east: number },
  minZoom: number,
  maxZoom: number
): { z: number; x: number; y: number }[] {
  const tiles: { z: number; x: number; y: number }[] = [];
  
  for (let z = minZoom; z <= maxZoom; z++) {
    const minX = lon2tile(bounds.west, z);
    const maxX = lon2tile(bounds.east, z);
    const minY = lat2tile(bounds.north, z);
    const maxY = lat2tile(bounds.south, z);
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  
  return tiles;
}

export function estimateTileCount(
  bounds: { south: number; west: number; north: number; east: number },
  minZoom: number,
  maxZoom: number
): number {
  let count = 0;
  
  for (let z = minZoom; z <= maxZoom; z++) {
    const minX = lon2tile(bounds.west, z);
    const maxX = lon2tile(bounds.east, z);
    const minY = lat2tile(bounds.north, z);
    const maxY = lat2tile(bounds.south, z);
    
    count += (maxX - minX + 1) * (maxY - minY + 1);
  }
  
  return count;
}

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

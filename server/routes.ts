import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { getStorage, MemStorage } from "./storage";
import { insertStopSchema, updateStopStatusSchema, loginSchema, createItinerarySchema, insertExpenseSchema, insertIncomeSchema, BUSINESS_RULES, type AccountSettings, type SubscriptionInfo } from "@shared/schema";
import { isSupabaseConfigured } from "./supabase";
import { supabaseStorage, type ExtendedUser } from "./supabaseStorage";
import bcrypt from "bcryptjs";

const storage = getStorage();

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    accountId?: string;
  }
}

function formatDateWithWeekday(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const weekday = weekdays[date.getDay()];
  return `${day}/${month}/${year} - ${weekday}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Google Geocoding API endpoint
  app.get('/api/geocode', async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Query parameter q is required' });
      }
      
      const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!googleApiKey) {
        return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY não configurada' });
      }
      
      // Expand common Brazilian abbreviations
      const expandAbbreviations = (addr: string): string => {
        return addr
          .replace(/^R\.?\s/i, 'Rua ')
          .replace(/^Av\.?\s/i, 'Avenida ')
          .replace(/^Al\.?\s/i, 'Alameda ')
          .replace(/^Tv\.?\s/i, 'Travessa ')
          .replace(/^Pç\.?\s/i, 'Praça ')
          .replace(/^Est\.?\s/i, 'Estrada ')
          .replace(/\bDr\.?\s/i, 'Doutor ')
          .replace(/\bProf\.?\s/i, 'Professor ')
          .replace(/\bEng\.?\s/i, 'Engenheiro ');
      };
      
      const cleanAddress = (addr: string): string => {
        return addr
          .replace(/\s+/g, ' ')
          .replace(/[^\w\s,.-áéíóúàâêôãõçÁÉÍÓÚÀÂÊÔÃÕÇ]/gi, '')
          .trim();
      };
      
      // Parse address to extract components
      const parseAddress = (addr: string): { street: string; houseNumber: string; neighborhood: string; city: string; state: string; cep: string } => {
        const parts = addr.split(',').map(p => p.trim());
        let street = '';
        let houseNumber = '';
        let neighborhood = '';
        let city = '';
        let state = '';
        let cep = '';
        
        if (parts[0]) {
          const streetMatch = parts[0].match(/^(.+?)\s+(\d{1,5}[A-Za-z]?)$/);
          if (streetMatch) {
            street = streetMatch[1];
            houseNumber = streetMatch[2];
          } else {
            street = parts[0];
          }
        }
        
        if (parts[1] && /^\d{1,5}[A-Za-z]?$/.test(parts[1])) {
          houseNumber = parts[1];
        }
        
        // Extract CEP
        for (const part of parts) {
          const cepMatch = part.match(/(\d{5}-?\d{3})/);
          if (cepMatch) {
            cep = cepMatch[1].replace('-', '');
            break;
          }
        }
        
        // Extract state
        for (const part of parts) {
          if (/^[A-Z]{2}$/i.test(part.trim()) && ['RJ', 'SP', 'MG', 'BA', 'RS', 'PR', 'SC', 'PE', 'CE', 'GO', 'PA', 'MA', 'PB', 'AM', 'RN', 'PI', 'AL', 'MT', 'MS', 'SE', 'RO', 'TO', 'AC', 'AP', 'RR', 'ES', 'DF'].includes(part.trim().toUpperCase())) {
            state = part.trim().toUpperCase();
          }
        }
        
        // Extract city and neighborhood
        const knownCities = ['Santos', 'São Paulo', 'Guarujá', 'Cubatão', 'Praia Grande', 'São Vicente'];
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i];
          if (/^\d/.test(part)) continue;
          if (/^\d{5}-?\d{3}$/.test(part)) continue;
          if (/^[A-Z]{2}$/i.test(part)) continue;
          if (part.length < 3) continue;
          
          for (const knownCity of knownCities) {
            if (part.toLowerCase().includes(knownCity.toLowerCase())) {
              city = knownCity;
              break;
            }
          }
          if (city) break;
          
          if (!neighborhood && i >= 2) {
            neighborhood = part;
          }
        }
        
        return { street: expandAbbreviations(street), houseNumber, neighborhood, city: city || 'Santos', state: state || 'SP', cep };
      };
      
      const cleanedQuery = cleanAddress(expandAbbreviations(q));
      const parsed = parseAddress(cleanedQuery);
      
      console.log('Geocoding address:', cleanedQuery);
      console.log('Parsed:', JSON.stringify(parsed));
      
      // Helper function to prioritize Santos results
      const prioritizeSantos = (results: any[]) => {
        return results.sort((a, b) => {
          const aIsSantos = a.display_name?.toLowerCase().includes('santos') || 
                           a.address?.city?.toLowerCase().includes('santos');
          const bIsSantos = b.display_name?.toLowerCase().includes('santos') || 
                           b.address?.city?.toLowerCase().includes('santos');
          if (aIsSantos && !bIsSantos) return -1;
          if (!aIsSantos && bIsSantos) return 1;
          return 0;
        });
      };
      
      // Build address query - add Santos if not specified, prioritize city
      let addressQuery = cleanedQuery;
      
      // If no city specified, add Santos
      if (!cleanedQuery.toLowerCase().includes('santos') && 
          !cleanedQuery.toLowerCase().includes('são paulo') &&
          !cleanedQuery.toLowerCase().includes('guarujá') &&
          !cleanedQuery.toLowerCase().includes('cubatão') &&
          !cleanedQuery.toLowerCase().includes('praia grande') &&
          !cleanedQuery.toLowerCase().includes('são vicente')) {
        addressQuery = `${cleanedQuery}, Santos, SP`;
      }
      
      // Ensure Brasil is in the query
      if (!addressQuery.toLowerCase().includes('brasil') && !addressQuery.toLowerCase().includes('brazil')) {
        addressQuery = `${addressQuery}, Brasil`;
      }
      
      const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressQuery)}&key=${googleApiKey}&language=pt-BR&region=br`;
      
      console.log('Google Geocoding request for:', addressQuery);
      
      const response = await fetch(googleUrl);
      
      if (!response.ok) {
        console.error('Google Geocoding API HTTP error:', response.status);
        return res.status(503).json({ error: 'Geocoding service unavailable' });
      }
      
      const data = await response.json();
      
      // Handle Google API errors
      if (data.status === 'REQUEST_DENIED') {
        console.error('Google Geocoding API denied:', data.error_message || 'Geocoding API not enabled');
        return res.status(403).json({ 
          error: 'Geocoding API não habilitada. Habilite a Geocoding API no Google Cloud Console.',
          status: data.status
        });
      }
      
      if (data.status === 'OVER_QUERY_LIMIT') {
        console.error('Google Geocoding API quota exceeded');
        return res.status(429).json({ error: 'Limite de consultas excedido', status: data.status });
      }
      
      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        console.log('Google Geocoding returned no results:', data.status);
        return res.json([]);
      }
      
      // Filter only Brazil results
      const brazilResults = data.results.filter((r: any) => {
        const countryComponent = r.address_components?.find((c: any) => c.types?.includes('country'));
        return countryComponent?.short_name === 'BR';
      });
      
      if (brazilResults.length === 0) {
        console.log('No Brazil results found');
        return res.json([]);
      }
      
      // Convert to standard format for frontend compatibility
      const results = brazilResults.map((r: any) => {
        const addressComponents = r.address_components || [];
        const getComponent = (type: string) => {
          const comp = addressComponents.find((c: any) => c.types?.includes(type));
          return comp?.long_name || '';
        };
        
        return {
          place_id: r.place_id,
          lat: String(r.geometry.location.lat),
          lon: String(r.geometry.location.lng),
          display_name: r.formatted_address,
          address: {
            road: getComponent('route'),
            house_number: getComponent('street_number'),
            suburb: getComponent('sublocality_level_1') || getComponent('sublocality') || getComponent('neighborhood'),
            city: getComponent('administrative_area_level_2') || getComponent('locality'),
            state: getComponent('administrative_area_level_1'),
            postcode: getComponent('postal_code'),
            country: getComponent('country'),
            country_code: 'br'
          },
          addresstype: r.types?.[0] || 'address',
          name: r.formatted_address,
          boundingbox: r.geometry.viewport ? [
            String(r.geometry.viewport.southwest.lat),
            String(r.geometry.viewport.northeast.lat),
            String(r.geometry.viewport.southwest.lng),
            String(r.geometry.viewport.northeast.lng)
          ] : undefined,
          source: 'google'
        };
      });
      
      console.log(`Google Geocoding returned ${results.length} Brazil results`);
      return res.json(prioritizeSantos(results));
    } catch (error) {
      console.error('Geocoding error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Google Directions API endpoint
  app.get('/api/route', async (req: Request, res: Response) => {
    try {
      const { coordinates } = req.query;
      if (!coordinates || typeof coordinates !== 'string') {
        return res.status(400).json({ error: 'Coordinates parameter is required' });
      }
      
      const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!googleApiKey) {
        return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY não configurada' });
      }
      
      // Parse coordinates string: "lon1,lat1;lon2,lat2;..."
      const points = coordinates.split(';').map(coord => {
        const [lon, lat] = coord.split(',').map(Number);
        return { lat, lng: lon };
      });
      
      if (points.length < 2) {
        return res.status(400).json({ error: 'At least 2 coordinates are required' });
      }
      
      const origin = `${points[0].lat},${points[0].lng}`;
      const destination = `${points[points.length - 1].lat},${points[points.length - 1].lng}`;
      
      // Build waypoints string (intermediate points)
      let waypointsStr = '';
      if (points.length > 2) {
        const waypoints = points.slice(1, -1).map(p => `${p.lat},${p.lng}`);
        waypointsStr = `&waypoints=${waypoints.join('|')}`;
      }
      
      const googleUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypointsStr}&mode=driving&language=pt-BR&region=br&key=${googleApiKey}`;
      
      console.log('Google Directions request');
      
      const response = await fetch(googleUrl);
      
      if (!response.ok) {
        console.error('Google Directions API error:', response.status);
        return res.status(response.status).json({ error: 'Routing service error' });
      }
      
      const data = await response.json();
      
      if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
        console.log('Google Directions returned no routes:', data.status);
        return res.json({ routes: [] });
      }
      
      // Convert to OSRM-like format for compatibility with existing frontend
      const route = data.routes[0];
      const legs = route.legs || [];
      
      // Decode overview polyline to GeoJSON coordinates
      const decodedPath = decodePolyline(route.overview_polyline?.points || '');
      
      const result = {
        routes: [{
          geometry: {
            type: 'LineString',
            coordinates: decodedPath.map((p: {lat: number, lng: number}) => [p.lng, p.lat])
          },
          legs: legs.map((leg: any) => ({
            distance: leg.distance?.value || 0,
            duration: leg.duration?.value || 0,
            summary: leg.start_address + ' -> ' + leg.end_address
          })),
          distance: legs.reduce((sum: number, leg: any) => sum + (leg.distance?.value || 0), 0),
          duration: legs.reduce((sum: number, leg: any) => sum + (leg.duration?.value || 0), 0)
        }],
        source: 'google'
      };
      
      console.log('Google Directions returned route with', decodedPath.length, 'points');
      res.json(result);
    } catch (error) {
      console.error('Routing error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Helper function to decode Google polyline
  function decodePolyline(encoded: string): Array<{lat: number, lng: number}> {
    const points: Array<{lat: number, lng: number}> = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }

    return points;
  }

  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body;
      
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Preencha todos os campos' });
      }

      if (password.length < 4) {
        return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'Este email já está cadastrado. Tente fazer login.' });
      }

      if (isSupabaseConfigured()) {
        const user = await supabaseStorage.createUser(email, name, password) as ExtendedUser;
        req.session.userId = user.id;
        req.session.accountId = user.accountId;
        
        const subscription = await supabaseStorage.getSubscriptionInfo(user.accountId);
        
        res.status(201).json({ 
          user: { id: user.id, email: user.email, name: user.name },
          subscription
        });
      } else {
        const user = await storage.createUser(email, name);
        req.session.userId = user.id;
        res.status(201).json({ 
          user,
          subscription: {
            plan: 'trial',
            status: 'active',
            trialDaysRemaining: 16,
            isTrialExpired: false,
            canAccessFinancials: true,
          }
        });
      }
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Dados inválidos' });
      }

      const { email, password } = result.data;
      
      if (isSupabaseConfigured()) {
        const user = await supabaseStorage.validatePassword(email, password);
        if (!user) {
          return res.status(401).json({ error: 'Email ou senha inválidos' });
        }

        req.session.userId = user.id;
        req.session.accountId = user.accountId;
        
        const subscription = await supabaseStorage.getSubscriptionInfo(user.accountId);
        
        res.json({ 
          user: { id: user.id, email: user.email, name: user.name },
          subscription
        });
      } else {
        let user = await storage.getUserByEmail(email);
        if (!user) {
          const name = email.split('@')[0];
          user = await storage.createUser(email, name);
        }

        req.session.userId = user.id;
        res.json({ 
          user,
          subscription: {
            plan: 'trial',
            status: 'active',
            trialDaysRemaining: 16,
            isTrialExpired: false,
            canAccessFinancials: true,
          }
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao sair' });
      }
      res.json({ success: true });
    });
  });

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    let subscription: SubscriptionInfo = {
      plan: 'trial',
      status: 'active',
      trialDaysRemaining: 16,
      isTrialExpired: false,
      canAccessFinancials: true,
    };

    if (isSupabaseConfigured() && req.session.accountId) {
      subscription = await supabaseStorage.getSubscriptionInfo(req.session.accountId);
    }

    res.json({ 
      user: { id: user.id, email: user.email, name: user.name },
      subscription
    });
  });

  app.get('/api/subscription', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    let subscription: SubscriptionInfo = {
      plan: 'trial',
      status: 'active',
      trialDaysRemaining: 16,
      isTrialExpired: false,
      canAccessFinancials: true,
    };

    if (isSupabaseConfigured() && req.session.accountId) {
      subscription = await supabaseStorage.getSubscriptionInfo(req.session.accountId);
    }

    res.json(subscription);
  });

  // Settings endpoints
  app.get('/api/settings', async (req: Request, res: Response) => {
    if (!req.session.userId || !req.session.accountId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      if (isSupabaseConfigured()) {
        const settings = await supabaseStorage.getAccountSettings(req.session.accountId);
        res.json(settings);
      } else {
        res.json({
          earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
          sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
          sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
        });
      }
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({ error: 'Erro ao buscar configuracoes' });
    }
  });

  app.patch('/api/settings', async (req: Request, res: Response) => {
    if (!req.session.userId || !req.session.accountId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const { earningPerDelivery, sundayBonusThreshold, sundayBonusValue, startAddress, startLatitude, startLongitude } = req.body;
      
      if (typeof earningPerDelivery !== 'number' || earningPerDelivery <= 0) {
        return res.status(400).json({ error: 'Valor por entrega invalido' });
      }
      if (typeof sundayBonusThreshold !== 'number' || sundayBonusThreshold < 1) {
        return res.status(400).json({ error: 'Meta de entregas invalida' });
      }
      if (typeof sundayBonusValue !== 'number' || sundayBonusValue < 0) {
        return res.status(400).json({ error: 'Valor do bonus invalido' });
      }

      if (isSupabaseConfigured()) {
        const settings = await supabaseStorage.updateAccountSettings(req.session.accountId, {
          earningPerDelivery,
          sundayBonusThreshold,
          sundayBonusValue,
          startAddress,
          startLatitude,
          startLongitude,
        });
        res.json(settings);
      } else {
        res.json({ earningPerDelivery, sundayBonusThreshold, sundayBonusValue, startAddress, startLatitude, startLongitude });
      }
    } catch (error) {
      console.error('Update settings error:', error);
      res.status(500).json({ error: 'Erro ao atualizar configuracoes' });
    }
  });

  app.get('/api/itinerary', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const itinerary = await storage.getActiveItinerary(req.session.userId);
      res.json({ itinerary: itinerary || null });
    } catch (error) {
      console.error('Get itinerary error:', error);
      res.status(500).json({ error: 'Erro ao buscar rota' });
    }
  });

  // Histórico de rotas finalizadas
  app.get('/api/itinerary/history', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const limit = parseInt(req.query.limit as string) || 10;
      let itineraries: any[] = [];
      
      if (isSupabaseConfigured() && supabaseStorage.getCompletedItineraries) {
        itineraries = await supabaseStorage.getCompletedItineraries(req.session.userId, limit);
      }
      
      res.json({ itineraries });
    } catch (error) {
      console.error('Get itinerary history error:', error);
      res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
  });

  // Get stops from a specific itinerary (for history view)
  app.get('/api/itinerary/:id/stops', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const id = req.params.id as string;
      
      if (isSupabaseConfigured()) {
        const stops = await supabaseStorage.getStops(id);
        res.json({ stops });
      } else {
        res.json({ stops: [] });
      }
    } catch (error) {
      console.error('Get itinerary stops error:', error);
      res.status(500).json({ error: 'Erro ao buscar paradas' });
    }
  });

  app.post('/api/itinerary', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const result = createItinerarySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Dados inválidos', details: result.error.errors });
      }

      const { date, name } = result.data;
      const routeName = name?.trim() || formatDateWithWeekday(date);
      
      // Reseta o contador de pacotes para começar do 1 em toda nova rota
      if (isSupabaseConfigured() && supabaseStorage.resetStopCounter && req.session.accountId) {
        await supabaseStorage.resetStopCounter(req.session.accountId);
        console.log('Stop counter reset for account:', req.session.accountId);
      }
      
      const itinerary = await storage.createItinerary(req.session.userId, date, routeName);
      res.status(201).json({ itinerary });
    } catch (error) {
      console.error('Create itinerary error:', error);
      res.status(500).json({ error: 'Erro ao criar rota' });
    }
  });

  // Criar nova rota após finalizar a anterior - reseta contador de pacotes
  app.post('/api/itinerary/new', async (req: Request, res: Response) => {
    if (!req.session.userId || !req.session.accountId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const result = createItinerarySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Dados inválidos', details: result.error.errors });
      }

      const { date, name } = result.data;
      const routeName = name?.trim() || formatDateWithWeekday(date);
      
      // Reseta o contador de pacotes para começar do 1
      if (isSupabaseConfigured() && supabaseStorage.resetStopCounter) {
        await supabaseStorage.resetStopCounter(req.session.accountId);
        console.log('Stop counter reset for account:', req.session.accountId);
      }
      
      const itinerary = await storage.createItinerary(req.session.userId, date, routeName);
      res.status(201).json({ itinerary, counterReset: true });
    } catch (error) {
      console.error('Create new itinerary error:', error);
      res.status(500).json({ error: 'Erro ao criar nova rota' });
    }
  });

  app.get('/api/stops', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.json([]);
    }

    try {
      const stops = await storage.getStopsByUserId(req.session.userId);
      res.json(stops);
    } catch (error) {
      console.error('Get stops error:', error);
      res.status(500).json({ error: 'Erro ao buscar paradas' });
    }
  });

  app.post('/api/stops/check-duplicate', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const { latitude, longitude } = req.body;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ error: 'Coordenadas inválidas' });
      }

      const itinerary = await storage.getActiveItinerary(req.session.userId);
      if (!itinerary) {
        return res.json({ exists: false });
      }

      if (storage.findStopByAddress) {
        const existingStop = await storage.findStopByAddress(itinerary.id, latitude, longitude);
        if (existingStop) {
          return res.json({ 
            exists: true, 
            stop: existingStop,
            packageCount: existingStop.packageCount || 1
          });
        }
      }

      res.json({ exists: false });
    } catch (error) {
      console.error('Check duplicate error:', error);
      res.status(500).json({ error: 'Erro ao verificar endereço' });
    }
  });

  app.post('/api/stops/:id/add-package', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const stopId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (storage.incrementPackageCount) {
        const updatedStop = await storage.incrementPackageCount(stopId);
        if (updatedStop) {
          return res.json(updatedStop);
        }
      }

      res.status(404).json({ error: 'Parada não encontrada' });
    } catch (error) {
      console.error('Add package error:', error);
      res.status(500).json({ error: 'Erro ao adicionar pacote' });
    }
  });

  app.post('/api/stops', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      console.log('POST /api/stops - Received body:', JSON.stringify(req.body));
      const result = insertStopSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Dados inválidos', details: result.error.errors });
      }
      console.log('POST /api/stops - Parsed data:', JSON.stringify(result.data));

      const itinerary = await storage.getActiveItinerary(req.session.userId);
      if (!itinerary) {
        return res.status(400).json({ error: 'Crie uma rota primeiro' });
      }
      
      const existingStops = await storage.getStops(itinerary.id);
      const sequenceOrder = existingStops.length + 1;
      
      // Usar sequenceOrder como número do pacote - cada rota começa do 1
      const fixedIdentifier = `Pacote ${sequenceOrder}`;
      console.log('Creating stop - sequenceOrder:', sequenceOrder, 'fixedIdentifier:', fixedIdentifier);

      const stop = await storage.createStop(
        itinerary.id,
        result.data,
        fixedIdentifier,
        sequenceOrder
      );

      res.status(201).json(stop);
    } catch (error) {
      console.error('Create stop error:', error);
      res.status(500).json({ error: 'Erro ao criar parada' });
    }
  });

  app.patch('/api/stops/:id/status', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const result = updateStopStatusSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Status inválido' });
      }

      const stopId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      
      // Se status é 'delivered' e há deliveredCount, usar essa quantidade para contabilizar
      const deliveredCount = result.data.deliveredCount;
      
      const stop = await storage.updateStop(stopId, {
        status: result.data.status,
        // Se entregou menos pacotes que o total, atualizar o packageCount para a quantidade entregue
        ...(result.data.status === 'delivered' && deliveredCount ? { deliveredPackageCount: deliveredCount } : {}),
      });

      if (!stop) {
        return res.status(404).json({ error: 'Parada não encontrada' });
      }

      // Retornar o stop com a quantidade de pacotes entregues para o frontend
      res.json({
        ...stop,
        deliveredPackageCount: deliveredCount || stop.packageCount || 1,
      });
    } catch (error) {
      console.error('Update stop status error:', error);
      res.status(500).json({ error: 'Erro ao atualizar status' });
    }
  });

  app.delete('/api/stops/:id', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const stopId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const deleted = await storage.deleteStop(stopId);
      if (!deleted) {
        return res.status(404).json({ error: 'Parada não encontrada' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Delete stop error:', error);
      res.status(500).json({ error: 'Erro ao remover parada' });
    }
  });

  app.patch('/api/stops/:id', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const stopId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { addressFull, latitude, longitude } = req.body;
      
      if (!addressFull || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: 'Dados incompletos' });
      }

      const stop = await storage.updateStop(stopId, {
        addressFull,
        latitude,
        longitude,
      });
      
      if (!stop) {
        return res.status(404).json({ error: 'Parada não encontrada' });
      }

      res.json(stop);
    } catch (error) {
      console.error('Update stop error:', error);
      res.status(500).json({ error: 'Erro ao atualizar parada' });
    }
  });

  app.post('/api/stops/:id/set-current', async (req: Request, res: Response) => {
    // Debug logs for external server troubleshooting
    const sessionId = req.sessionID ? req.sessionID.substring(0, 8) + '...' : 'NENHUM';
    const cookiesReceived = req.headers.cookie ? 'SIM' : 'NÃO';
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    
    console.log('[DEBUG SET-CURRENT] POST /api/stops/:id/set-current');
    console.log(`  -> Stop ID: ${req.params.id}`);
    console.log(`  -> Cookies recebidos: ${cookiesReceived}`);
    console.log(`  -> Session ID: ${sessionId}`);
    console.log(`  -> Session userId: ${req.session.userId || 'NENHUM'}`);
    console.log(`  -> X-Forwarded-Proto: ${proto}`);
    console.log(`  -> Cookie header: ${req.headers.cookie ? req.headers.cookie.substring(0, 50) + '...' : 'VAZIO'}`);
    
    if (!req.session.userId) {
      console.log('[DEBUG SET-CURRENT] ERRO 401: Usuário não autenticado');
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const stopId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const userId = req.session.userId;
      
      console.log(`[DEBUG SET-CURRENT] Buscando itinerário para userId: ${userId}`);
      
      const itinerary = await storage.getActiveItinerary(userId);
      if (!itinerary) {
        console.log('[DEBUG SET-CURRENT] ERRO 404: Nenhum itinerário ativo');
        return res.status(404).json({ error: 'Nenhum itinerário ativo' });
      }

      console.log(`[DEBUG SET-CURRENT] Itinerário encontrado: ${itinerary.id}`);
      
      const allStops = await storage.getStops(itinerary.id);
      const targetStop = allStops.find(s => String(s.id) === String(stopId));
      
      if (!targetStop) {
        console.log(`[DEBUG SET-CURRENT] ERRO 404: Parada ${stopId} não encontrada`);
        return res.status(404).json({ error: 'Parada não encontrada' });
      }

      console.log(`[DEBUG SET-CURRENT] Parada encontrada: ID ${targetStop.id}, status: ${targetStop.status}`);

      if (targetStop.status !== 'pending') {
        console.log(`[DEBUG SET-CURRENT] ERRO 400: Status inválido: ${targetStop.status}`);
        return res.status(400).json({ error: 'Apenas paradas pendentes podem ser selecionadas' });
      }

      // Set any current stop back to pending, then set the target as current
      const currentStop = allStops.find(s => s.status === 'current');
      if (currentStop) {
        console.log(`[DEBUG SET-CURRENT] Resetando parada atual: ${currentStop.id}`);
        await storage.updateStop(currentStop.id, { status: 'pending' });
      }
      
      const updatedStop = await storage.updateStop(stopId, { status: 'current' });
      
      console.log(`[DEBUG SET-CURRENT] SUCESSO: Parada ${stopId} definida como atual`);
      res.json({ stop: updatedStop, message: 'Parada selecionada como atual' });
    } catch (error) {
      console.error('[DEBUG SET-CURRENT] ERRO 500:', error);
      res.status(500).json({ error: 'Erro ao selecionar parada' });
    }
  });

  app.post('/api/stops/optimize', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const itinerary = await storage.getActiveItinerary(req.session.userId);
      if (!itinerary) {
        return res.status(400).json({ error: 'Nenhuma rota ativa' });
      }
      
      const stops = await storage.getStops(itinerary.id);
      
      if (stops.length < 2) {
        return res.json({ stops });
      }

      const { latitude: userLat, longitude: userLng } = req.body || {};
      
      // Buscar endereço inicial configurado nas settings (prioridade sobre GPS)
      let startLat = userLat;
      let startLng = userLng;
      
      if (isSupabaseConfigured() && req.session.accountId) {
        const settings = await supabaseStorage.getAccountSettings(req.session.accountId);
        if (settings.startLatitude && settings.startLongitude) {
          console.log('Using configured start address:', settings.startAddress);
          startLat = settings.startLatitude;
          startLng = settings.startLongitude;
        }
      }
      
      const pendingStops = stops.filter(s => s.status === 'pending' || s.status === 'current');
      const completedStops = stops.filter(s => s.status === 'delivered' || s.status === 'failed');

      // Função de fallback: Vizinho Mais Próximo (Nearest Neighbor) com distância em linha reta
      const nearestNeighborSort = (startLat: number, startLng: number, stopsToSort: typeof pendingStops) => {
        const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLng = (lng2 - lng1) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          return R * c;
        };

        const sorted: typeof pendingStops = [];
        const remaining = [...stopsToSort];
        let currentLat = startLat;
        let currentLng = startLng;

        while (remaining.length > 0) {
          let nearestIdx = 0;
          let nearestDist = Infinity;

          for (let i = 0; i < remaining.length; i++) {
            const dist = calculateDistance(currentLat, currentLng, remaining[i].latitude, remaining[i].longitude);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestIdx = i;
            }
          }

          const nearest = remaining.splice(nearestIdx, 1)[0];
          sorted.push(nearest);
          currentLat = nearest.latitude;
          currentLng = nearest.longitude;
        }

        return sorted;
      };

      let sortedPending: typeof pendingStops;
      if (startLat && startLng) {
        console.log('Optimizing from start point:', { startLat, startLng });
        console.log('Pending stops before optimization:', pendingStops.map(s => ({ id: s.id.slice(0,8), addr: s.addressFull.slice(0,30), lat: s.latitude, lng: s.longitude })));
        
        sortedPending = nearestNeighborSort(startLat, startLng, pendingStops);
        console.log('Using Nearest Neighbor algorithm for route optimization');
        
        console.log('Sorted stops after optimization:', sortedPending.map(s => ({ id: s.id.slice(0,8), addr: s.addressFull.slice(0,30) })));
      } else {
        console.log('No start point, falling back to latitude sort');
        sortedPending = [...pendingStops].sort((a, b) => b.latitude - a.latitude);
      }
      
      // Substitui pendingStops pelo resultado ordenado
      pendingStops.length = 0;
      pendingStops.push(...sortedPending);
      
      const reorderedIds = [...completedStops.map(s => s.id), ...pendingStops.map(s => s.id)];
      console.log('Reordering with IDs:', reorderedIds);
      const reorderedStops = await storage.reorderStops(itinerary.id, reorderedIds);

      const finalStops = await storage.getStops(itinerary.id);
      res.json({ stops: finalStops });
    } catch (error) {
      console.error('Optimize stops error:', error);
      res.status(500).json({ error: 'Erro ao otimizar rota' });
    }
  });

  // Reorder stops (used for reverse route)
  app.post('/api/stops/reorder', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const { stopIds } = req.body;
      
      if (!Array.isArray(stopIds) || stopIds.length === 0) {
        return res.status(400).json({ error: 'Lista de IDs inválida' });
      }

      const itinerary = await storage.getActiveItinerary(req.session.userId);
      if (!itinerary) {
        return res.status(404).json({ error: 'Nenhum itinerário ativo' });
      }

      // Reorder stops in database
      const reorderedStops = await storage.reorderStops(itinerary.id, stopIds);

      const finalStops = await storage.getStops(itinerary.id);
      res.json({ stops: finalStops });
    } catch (error) {
      console.error('Reorder stops error:', error);
      res.status(500).json({ error: 'Erro ao reordenar rota' });
    }
  });

  app.get('/api/stats', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      let subscription: SubscriptionInfo = {
        plan: 'trial',
        status: 'active',
        trialDaysRemaining: 16,
        isTrialExpired: false,
        canAccessFinancials: true,
      };

      let settings: AccountSettings = {
        earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
        sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
        sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
      };

      if (isSupabaseConfigured() && req.session.accountId) {
        subscription = await supabaseStorage.getSubscriptionInfo(req.session.accountId);
        settings = await supabaseStorage.getAccountSettings(req.session.accountId);
      }

      const stops = await storage.getStopsByUserId(req.session.userId);
      // Somar packageCount para cada stop entregue (conta pacotes, não paradas)
      const deliveredCount = stops
        .filter(s => s.status === 'delivered')
        .reduce((sum, s) => sum + (s.packageCount || 1), 0);
      const failedCount = stops.filter(s => s.status === 'failed').length;
      const pendingCount = stops.filter(s => s.status === 'pending' || s.status === 'current').length;
      
      const today = new Date();
      const isSunday = today.getDay() === 0;
      const base = deliveredCount * settings.earningPerDelivery;
      const bonus = isSunday && deliveredCount >= settings.sundayBonusThreshold 
        ? settings.sundayBonusValue 
        : 0;

      if (!subscription.canAccessFinancials) {
        res.json({
          deliveredCount,
          failedCount,
          pendingCount,
          earnings: {
            base: 0,
            bonus: 0,
            total: 0,
            blocked: true,
            message: 'Período de teste expirado. Assine para ver seus ganhos.',
          },
          subscription,
        });
      } else {
        res.json({
          deliveredCount,
          failedCount,
          pendingCount,
          earnings: {
            base,
            bonus,
            total: base + bonus,
            blocked: false,
          },
          subscription,
        });
      }
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
  });

  // Finalizar rota - salva histórico de ganhos e marca itinerário como completo
  app.post('/api/itinerary/finalize', async (req: Request, res: Response) => {
    if (!req.session.userId || !req.session.accountId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      let settings: AccountSettings = {
        earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
        sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
        sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
      };

      if (isSupabaseConfigured()) {
        settings = await supabaseStorage.getAccountSettings(req.session.accountId);
      }

      const itinerary = await storage.getActiveItinerary(req.session.userId);
      if (!itinerary) {
        return res.status(400).json({ error: 'Nenhuma rota ativa para finalizar' });
      }

      const stops = await storage.getStops(itinerary.id);
      
      // Valida que não há paradas pendentes ou em andamento
      const pendingOrCurrent = stops.filter(s => s.status === 'pending' || s.status === 'current');
      if (pendingOrCurrent.length > 0) {
        return res.status(400).json({ 
          error: 'Rota incompleta',
          message: `Ainda há ${pendingOrCurrent.length} entrega(s) pendente(s). Complete todas as entregas antes de finalizar.`
        });
      }

      // Somar packageCount para cada stop entregue (conta pacotes, não paradas)
      const deliveredCount = stops
        .filter(s => s.status === 'delivered')
        .reduce((sum, s) => sum + (s.packageCount || 1), 0);
      
      // Calcula ganhos
      const itineraryDate = new Date(itinerary.date + 'T12:00:00');
      const isSunday = itineraryDate.getDay() === 0;
      const base = deliveredCount * settings.earningPerDelivery;
      const bonus = isSunday && deliveredCount >= settings.sundayBonusThreshold 
        ? settings.sundayBonusValue 
        : 0;
      const totalEarnings = base + bonus;

      // Gera nome único no formato Rota-DD-MM-AAAA
      const dateForName = new Date(itinerary.date + 'T12:00:00');
      const day = dateForName.getDate().toString().padStart(2, '0');
      const month = (dateForName.getMonth() + 1).toString().padStart(2, '0');
      const year = dateForName.getFullYear();
      const baseName = `Rota-${day}-${month}-${year}`;

      // Verifica se já existe rota com esse nome para adicionar sufixo
      let finalName = baseName;
      if (isSupabaseConfigured() && supabaseStorage.generateUniqueRouteName) {
        finalName = await supabaseStorage.generateUniqueRouteName(req.session.userId, baseName);
      }

      // Atualiza itinerário
      const updatedItinerary = await storage.updateItinerary(itinerary.id, {
        status: 'completed',
        name: finalName,
        totalEarnings,
      });

      // Salva no histórico de ganhos via storage layer
      if (isSupabaseConfigured() && supabaseStorage.saveEarningsHistory) {
        await supabaseStorage.saveEarningsHistory({
          accountId: req.session.accountId,
          userId: req.session.userId,
          itineraryId: itinerary.id,
          date: itinerary.date,
          deliveriesCount: deliveredCount,
          totalEarnings,
        });
      }

      res.json({
        success: true,
        itinerary: updatedItinerary,
        summary: {
          name: finalName,
          deliveredCount,
          earnings: totalEarnings,
        }
      });
    } catch (error) {
      console.error('Finalize route error:', error);
      res.status(500).json({ error: 'Erro ao finalizar rota' });
    }
  });

  app.get('/api/earnings', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      let subscription: SubscriptionInfo = {
        plan: 'trial',
        status: 'active',
        trialDaysRemaining: 16,
        isTrialExpired: false,
        canAccessFinancials: true,
      };

      let settings: AccountSettings = {
        earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
        sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
        sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
      };

      if (isSupabaseConfigured() && req.session.accountId) {
        subscription = await supabaseStorage.getSubscriptionInfo(req.session.accountId);
        settings = await supabaseStorage.getAccountSettings(req.session.accountId);
      }

      if (!subscription.canAccessFinancials) {
        return res.status(403).json({ 
          error: 'Acesso bloqueado',
          message: 'Período de teste expirado. Assine para ver seus ganhos.',
          blocked: true 
        });
      }

      const stops = await storage.getStopsByUserId(req.session.userId);
      // Somar packageCount para cada stop entregue (conta pacotes, não paradas)
      const deliveredCount = stops
        .filter(s => s.status === 'delivered')
        .reduce((sum, s) => sum + (s.packageCount || 1), 0);
      
      const today = new Date();
      const isSunday = today.getDay() === 0;
      const base = deliveredCount * settings.earningPerDelivery;
      const bonus = isSunday && deliveredCount >= settings.sundayBonusThreshold 
        ? settings.sundayBonusValue 
        : 0;

      res.json({
        base,
        bonus,
        total: base + bonus,
        deliveredCount,
      });
    } catch (error) {
      console.error('Get earnings error:', error);
      res.status(500).json({ error: 'Erro ao buscar ganhos' });
    }
  });

  app.get('/api/earnings/weekly', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      let subscription: SubscriptionInfo = {
        plan: 'trial',
        status: 'active',
        trialDaysRemaining: 16,
        isTrialExpired: false,
        canAccessFinancials: true,
      };

      let settings: AccountSettings = {
        earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
        sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
        sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
      };

      if (isSupabaseConfigured() && req.session.accountId) {
        subscription = await supabaseStorage.getSubscriptionInfo(req.session.accountId);
        settings = await supabaseStorage.getAccountSettings(req.session.accountId);
      }

      if (!subscription.canAccessFinancials) {
        return res.status(403).json({ 
          error: 'Acesso bloqueado',
          blocked: true 
        });
      }

      const today = new Date();
      const dayOfWeek = today.getDay();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - dayOfWeek);
      
      const dailyEarnings: { date: string; deliveries: number; earnings: number }[] = [];
      let weekTotal = 0;
      let weekDeliveries = 0;

      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        const stops = await storage.getStopsByUserId(req.session.userId);
        const dayStops = stops.filter(s => {
          const stopDate = new Date(s.createdAt).toISOString().split('T')[0];
          return stopDate === dateStr && s.status === 'delivered';
        });
        
        const deliveries = dayStops.length;
        const isBonusDay = isSundayOrHoliday(date);
        const base = deliveries * settings.earningPerDelivery;
        const bonus = isBonusDay && deliveries >= settings.sundayBonusThreshold 
          ? settings.sundayBonusValue : 0;
        const total = base + bonus;
        
        dailyEarnings.push({
          date: dateStr,
          deliveries,
          earnings: total,
        });
        
        weekTotal += total;
        weekDeliveries += deliveries;
      }

      res.json({
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        totalDeliveries: weekDeliveries,
        totalEarnings: weekTotal,
        dailyEarnings,
      });
    } catch (error) {
      console.error('Get weekly earnings error:', error);
      res.status(500).json({ error: 'Erro ao buscar ganhos semanais' });
    }
  });

  app.get('/api/earnings/monthly', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      let subscription: SubscriptionInfo = {
        plan: 'trial',
        status: 'active',
        trialDaysRemaining: 16,
        isTrialExpired: false,
        canAccessFinancials: true,
      };

      let settings: AccountSettings = {
        earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
        sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
        sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
      };

      if (isSupabaseConfigured() && req.session.accountId) {
        subscription = await supabaseStorage.getSubscriptionInfo(req.session.accountId);
        settings = await supabaseStorage.getAccountSettings(req.session.accountId);
      }

      if (!subscription.canAccessFinancials) {
        return res.status(403).json({ 
          error: 'Acesso bloqueado',
          blocked: true 
        });
      }

      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      
      const stops = await storage.getStopsByUserId(req.session.userId);
      const monthStops = stops.filter(s => {
        const stopDate = new Date(s.createdAt);
        return stopDate.getFullYear() === year && 
               stopDate.getMonth() === month && 
               s.status === 'delivered';
      });

      const deliveries = monthStops.length;
      const base = deliveries * settings.earningPerDelivery;
      
      const daysWithBonus = new Set<string>();
      monthStops.forEach(s => {
        const stopDate = new Date(s.createdAt);
        if (stopDate.getDay() === 0) {
          daysWithBonus.add(stopDate.toISOString().split('T')[0]);
        }
      });
      
      let bonus = 0;
      daysWithBonus.forEach(dateStr => {
        const dayDeliveries = monthStops.filter(s => 
          new Date(s.createdAt).toISOString().split('T')[0] === dateStr
        ).length;
        if (dayDeliveries >= settings.sundayBonusThreshold) {
          bonus += settings.sundayBonusValue;
        }
      });

      res.json({
        year,
        month: month + 1,
        totalDeliveries: deliveries,
        baseEarnings: base,
        bonusEarnings: bonus,
        totalEarnings: base + bonus,
        daysWorked: new Set(monthStops.map(s => 
          new Date(s.createdAt).toISOString().split('T')[0]
        )).size,
      });
    } catch (error) {
      console.error('Get monthly earnings error:', error);
      res.status(500).json({ error: 'Erro ao buscar ganhos mensais' });
    }
  });

  app.get('/api/expenses', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const { startDate, endDate } = req.query;
      const expenses = await storage.getExpenses(
        req.session.userId,
        startDate as string | undefined,
        endDate as string | undefined
      );
      res.json(expenses);
    } catch (error) {
      console.error('Get expenses error:', error);
      res.status(500).json({ error: 'Erro ao buscar despesas' });
    }
  });

  app.get('/api/expenses/today', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const expenses = await storage.getExpensesByDate(req.session.userId, today);
      const total = expenses.reduce((sum, e) => sum + e.amount, 0);
      
      const byCategory = expenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      }, {} as Record<string, number>);

      res.json({
        expenses,
        total,
        byCategory,
      });
    } catch (error) {
      console.error('Get today expenses error:', error);
      res.status(500).json({ error: 'Erro ao buscar despesas de hoje' });
    }
  });

  app.post('/api/expenses', async (req: Request, res: Response) => {
    if (!req.session.userId || !req.session.accountId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const parsed = insertExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
      }

      const expense = await storage.createExpense(
        req.session.userId,
        req.session.accountId,
        parsed.data
      );
      res.status(201).json(expense);
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(500).json({ error: 'Erro ao criar despesa' });
    }
  });

  app.delete('/api/expenses/:id', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const id = req.params.id as string;
      const deleted = await storage.deleteExpense(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Despesa não encontrada' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Delete expense error:', error);
      res.status(500).json({ error: 'Erro ao deletar despesa' });
    }
  });

  app.get('/api/incomes', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const { startDate, endDate } = req.query;
      const incomes = await storage.getIncomes(
        req.session.userId,
        startDate as string | undefined,
        endDate as string | undefined
      );
      res.json(incomes);
    } catch (error) {
      console.error('Get incomes error:', error);
      res.status(500).json({ error: 'Erro ao buscar rendas' });
    }
  });

  app.post('/api/incomes', async (req: Request, res: Response) => {
    if (!req.session.userId || !req.session.accountId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const parsed = insertIncomeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.issues });
      }

      const income = await storage.createIncome(
        req.session.userId,
        req.session.accountId,
        parsed.data
      );
      res.status(201).json(income);
    } catch (error) {
      console.error('Create income error:', error);
      res.status(500).json({ error: 'Erro ao criar renda' });
    }
  });

  app.delete('/api/incomes/:id', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const id = req.params.id as string;
      const deleted = await storage.deleteIncome(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Renda não encontrada' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Delete income error:', error);
      res.status(500).json({ error: 'Erro ao deletar renda' });
    }
  });

  app.get('/api/finance/summary', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      let subscription: SubscriptionInfo = {
        plan: 'trial',
        status: 'active',
        trialDaysRemaining: 16,
        isTrialExpired: false,
        canAccessFinancials: true,
      };

      let settings: AccountSettings = {
        earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
        sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
        sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
      };

      if (isSupabaseConfigured() && req.session.accountId) {
        subscription = await supabaseStorage.getSubscriptionInfo(req.session.accountId);
        settings = await supabaseStorage.getAccountSettings(req.session.accountId);
      }

      if (!subscription.canAccessFinancials) {
        return res.status(403).json({ 
          error: 'Acesso bloqueado',
          blocked: true 
        });
      }

      const today = new Date().toISOString().split('T')[0];
      
      const stops = await storage.getStopsByUserId(req.session.userId);
      // Somar packageCount para cada stop entregue (conta pacotes, não paradas)
      const deliveredCount = stops
        .filter(s => s.status === 'delivered')
        .reduce((sum, s) => sum + (s.packageCount || 1), 0);
      
      const isSunday = new Date().getDay() === 0;
      const baseEarnings = deliveredCount * settings.earningPerDelivery;
      const bonusEarnings = isSunday && deliveredCount >= settings.sundayBonusThreshold 
        ? settings.sundayBonusValue : 0;
      const deliveryEarnings = baseEarnings + bonusEarnings;

      const todayIncomes = await storage.getIncomesByDate(req.session.userId, today);
      const otherIncomes = todayIncomes.reduce((sum, i) => sum + i.amount, 0);
      const totalEarnings = deliveryEarnings + otherIncomes;

      const incomesByCategory = todayIncomes.reduce((acc, i) => {
        acc[i.category] = (acc[i.category] || 0) + i.amount;
        return acc;
      }, {} as Record<string, number>);

      const todayExpenses = await storage.getExpensesByDate(req.session.userId, today);
      const totalExpenses = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

      const expensesByCategory = todayExpenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      }, {} as Record<string, number>);

      const netProfit = totalEarnings - totalExpenses;

      res.json({
        date: today,
        deliveries: deliveredCount,
        earnings: {
          base: baseEarnings,
          bonus: bonusEarnings,
          deliveryTotal: deliveryEarnings,
          otherIncomes,
          total: totalEarnings,
        },
        incomes: {
          total: otherIncomes,
          byCategory: incomesByCategory,
          items: todayIncomes.slice(0, 5),
        },
        expenses: {
          total: totalExpenses,
          byCategory: expensesByCategory,
          items: todayExpenses.slice(0, 5),
        },
        netProfit,
        isSunday,
        bonusProgress: isSunday ? {
          current: deliveredCount,
          target: settings.sundayBonusThreshold,
          achieved: deliveredCount >= settings.sundayBonusThreshold,
        } : null,
      });
    } catch (error) {
      console.error('Get finance summary error:', error);
      res.status(500).json({ error: 'Erro ao buscar resumo financeiro' });
    }
  });

  function getBrazilianHolidays(year: number): Set<string> {
    const holidays = new Set<string>();
    
    const fixedHolidays = [
      `${year}-01-01`,
      `${year}-04-21`,
      `${year}-05-01`,
      `${year}-09-07`,
      `${year}-10-12`,
      `${year}-11-02`,
      `${year}-11-15`,
      `${year}-12-25`,
    ];
    fixedHolidays.forEach(d => holidays.add(d));
    
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    const easter = new Date(year, month, day);
    
    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    holidays.add(goodFriday.toISOString().split('T')[0]);
    
    const carnival1 = new Date(easter);
    carnival1.setDate(easter.getDate() - 48);
    holidays.add(carnival1.toISOString().split('T')[0]);
    
    const carnival2 = new Date(easter);
    carnival2.setDate(easter.getDate() - 47);
    holidays.add(carnival2.toISOString().split('T')[0]);
    
    const corpusChristi = new Date(easter);
    corpusChristi.setDate(easter.getDate() + 60);
    holidays.add(corpusChristi.toISOString().split('T')[0]);
    
    return holidays;
  }

  function isSundayOrHoliday(date: Date): boolean {
    if (date.getDay() === 0) return true;
    const dateStr = date.toISOString().split('T')[0];
    const holidays = getBrazilianHolidays(date.getFullYear());
    return holidays.has(dateStr);
  }

  function getCurrentCycleDates(): { startDate: string; endDate: string } {
    const today = new Date();
    const day = today.getDate();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    if (day <= 15) {
      const start = new Date(year, month, 1);
      const end = new Date(year, month, 15);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    } else {
      const start = new Date(year, month, 16);
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end = new Date(year, month, lastDay);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    }
  }

  function getPreviousCycleDates(): { startDate: string; endDate: string } {
    const today = new Date();
    const day = today.getDate();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    if (day <= 15) {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const lastDayPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
      const start = new Date(prevYear, prevMonth, 16);
      const end = new Date(prevYear, prevMonth, lastDayPrevMonth);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    } else {
      const start = new Date(year, month, 1);
      const end = new Date(year, month, 15);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      };
    }
  }

  function getQuinzenaLabel(dateStr: string): string {
    const date = new Date(dateStr + 'T12:00:00');
    const day = date.getDate();
    const month = date.toLocaleDateString('pt-BR', { month: 'short' });
    return day <= 15 ? `1ª Quinzena ${month}` : `2ª Quinzena ${month}`;
  }

  function getPaymentQuinzenaLabel(dateStr: string): string {
    const date = new Date(dateStr + 'T12:00:00');
    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();
    
    if (day <= 15) {
      const paymentDate = new Date(year, month, 16);
      return `2ª Quinzena ${paymentDate.toLocaleDateString('pt-BR', { month: 'short' })}`;
    } else {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const paymentDate = new Date(nextYear, nextMonth, 1);
      return `1ª Quinzena ${paymentDate.toLocaleDateString('pt-BR', { month: 'short' })}`;
    }
  }

  function getDaysRemainingInCycle(): number {
    const today = new Date();
    const { endDate } = getCurrentCycleDates();
    const end = new Date(endDate);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  app.get('/api/finance/cycle', async (req: Request, res: Response) => {
    if (!req.session.userId || !req.session.accountId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      let subscription: SubscriptionInfo = {
        plan: 'trial',
        status: 'active',
        trialDaysRemaining: 16,
        isTrialExpired: false,
        canAccessFinancials: true,
      };

      let settings: AccountSettings = {
        earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
        sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
        sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
      };

      if (isSupabaseConfigured()) {
        subscription = await supabaseStorage.getSubscriptionInfo(req.session.accountId);
        settings = await supabaseStorage.getAccountSettings(req.session.accountId);
      }

      if (!subscription.canAccessFinancials) {
        return res.status(403).json({ 
          error: 'Acesso bloqueado',
          blocked: true 
        });
      }

      const { startDate, endDate } = getCurrentCycleDates();
      const prevCycle = getPreviousCycleDates();
      const daysRemaining = getDaysRemainingInCycle();

      const deliveredStops = await storage.getDeliveredStopsInPeriod(
        req.session.userId,
        startDate,
        endDate
      );
      const deliveriesCount = deliveredStops.reduce((sum, s) => sum + (s.packageCount || 1), 0);
      const baseEarnings = deliveriesCount * settings.earningPerDelivery;
      
      // Bônus conquistados no ciclo ATUAL (registrados, mas pagos na próxima quinzena)
      const bonusDeliveries = deliveredStops.filter(s => {
        const date = new Date(s.deliveryTime || s.createdAt);
        return isSundayOrHoliday(date);
      });
      
      const bonusDaysByDate = bonusDeliveries.reduce((acc, s) => {
        const dateKey = new Date(s.deliveryTime || s.createdAt).toISOString().split('T')[0];
        acc[dateKey] = (acc[dateKey] || 0) + (s.packageCount || 1);
        return acc;
      }, {} as Record<string, number>);
      
      interface BonusDetail {
        earnedDate: string;
        earnedQuinzena: string;
        paymentQuinzena: string;
        deliveries: number;
        value: number;
      }
      
      const currentCycleBonuses: BonusDetail[] = [];
      Object.entries(bonusDaysByDate).forEach(([dateKey, count]) => {
        if (count >= settings.sundayBonusThreshold) {
          currentCycleBonuses.push({
            earnedDate: dateKey,
            earnedQuinzena: getQuinzenaLabel(dateKey),
            paymentQuinzena: getPaymentQuinzenaLabel(dateKey),
            deliveries: count,
            value: settings.sundayBonusValue,
          });
        }
      });
      const currentCycleBonusTotal = currentCycleBonuses.reduce((sum, b) => sum + b.value, 0);

      // Bônus conquistados no ciclo ANTERIOR (a serem pagos neste ciclo)
      const prevDeliveredStops = await storage.getDeliveredStopsInPeriod(
        req.session.userId,
        prevCycle.startDate,
        prevCycle.endDate
      );
      
      const prevBonusDeliveries = prevDeliveredStops.filter(s => {
        const date = new Date(s.deliveryTime || s.createdAt);
        return isSundayOrHoliday(date);
      });
      
      const prevBonusDaysByDate = prevBonusDeliveries.reduce((acc, s) => {
        const dateKey = new Date(s.deliveryTime || s.createdAt).toISOString().split('T')[0];
        acc[dateKey] = (acc[dateKey] || 0) + (s.packageCount || 1);
        return acc;
      }, {} as Record<string, number>);
      
      const paidBonuses: BonusDetail[] = [];
      Object.entries(prevBonusDaysByDate).forEach(([dateKey, count]) => {
        if (count >= settings.sundayBonusThreshold) {
          paidBonuses.push({
            earnedDate: dateKey,
            earnedQuinzena: getQuinzenaLabel(dateKey),
            paymentQuinzena: getPaymentQuinzenaLabel(dateKey),
            deliveries: count,
            value: settings.sundayBonusValue,
          });
        }
      });
      const paidBonusTotal = paidBonuses.reduce((sum, b) => sum + b.value, 0);

      const cycleIncomes = await storage.getIncomesInPeriod(
        req.session.userId,
        startDate,
        endDate
      );
      const otherIncomes = cycleIncomes.reduce((sum, i) => sum + i.amount, 0);

      const cycleExpenses = await storage.getExpensesInPeriod(
        req.session.userId,
        startDate,
        endDate
      );
      const totalExpenses = cycleExpenses.reduce((sum, e) => sum + e.amount, 0);

      // Bônus pago = da quinzena anterior (diferimento)
      const totalEarnings = baseEarnings + paidBonusTotal + otherIncomes;
      const netProfit = totalEarnings - totalExpenses;

      const cycleHistory = await storage.getFinancialCycleHistory(req.session.userId);

      const dailyStats = await storage.getDailyDeliveryStats(
        req.session.userId,
        startDate,
        endDate
      );

      const monthlyStats = await storage.getMonthlyDeliveryStats(
        req.session.userId,
        new Date().getFullYear(),
        new Date().getMonth() + 1
      );

      res.json({
        currentCycle: {
          startDate,
          endDate,
          daysRemaining,
          deliveries: deliveriesCount,
          earnings: {
            base: baseEarnings,
            bonus: paidBonusTotal,
            bonusEarnedThisCycle: currentCycleBonusTotal,
            otherIncomes,
            total: totalEarnings,
          },
          bonusDetails: {
            earned: currentCycleBonuses,
            paid: paidBonuses,
          },
          expenses: totalExpenses,
          netProfit,
        },
        history: cycleHistory,
        dailyStats,
        monthlyStats,
      });
    } catch (error) {
      console.error('Get finance cycle error:', error);
      res.status(500).json({ error: 'Erro ao buscar ciclo financeiro' });
    }
  });

  app.patch('/api/finance/cycle/:id/status', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const id = req.params.id as string;
      const { status } = req.body;

      if (status !== 'paid' && status !== 'pending') {
        return res.status(400).json({ error: 'Status inválido' });
      }

      const updatedCycle = await storage.updateFinancialCycleStatus(id, status);
      
      if (!updatedCycle) {
        return res.status(404).json({ error: 'Ciclo não encontrado' });
      }

      res.json(updatedCycle);
    } catch (error) {
      console.error('Update cycle status error:', error);
      res.status(500).json({ error: 'Erro ao atualizar status do ciclo' });
    }
  });

  app.post('/api/finance/cycle/close', async (req: Request, res: Response) => {
    if (!req.session.userId || !req.session.accountId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const { startDate, endDate } = getCurrentCycleDates();
      
      const deliveredStops = await storage.getDeliveredStopsInPeriod(
        req.session.userId,
        startDate,
        endDate
      );
      // Somar packageCount para cada stop entregue (conta pacotes, não paradas)
      const deliveriesCount = deliveredStops.reduce((sum, s) => sum + (s.packageCount || 1), 0);
      
      const baseEarnings = deliveriesCount * BUSINESS_RULES.EARNING_PER_DELIVERY;
      
      let bonusEarnings = 0;
      const bonusDayDeliveries = deliveredStops.filter(s => {
        const date = new Date(s.deliveryTime || s.createdAt);
        return isSundayOrHoliday(date);
      });
      const bonusDaysByDateFinalize = bonusDayDeliveries.reduce((acc, s) => {
        const dateKey = new Date(s.deliveryTime || s.createdAt).toISOString().split('T')[0];
        acc[dateKey] = (acc[dateKey] || 0) + (s.packageCount || 1);
        return acc;
      }, {} as Record<string, number>);
      Object.values(bonusDaysByDateFinalize).forEach(count => {
        if (count >= BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD) {
          bonusEarnings += BUSINESS_RULES.SUNDAY_BONUS_VALUE;
        }
      });

      const cycleIncomes = await storage.getIncomesInPeriod(req.session.userId, startDate, endDate);
      const otherIncomes = cycleIncomes.reduce((sum, i) => sum + i.amount, 0);
      
      const cycleExpenses = await storage.getExpensesInPeriod(req.session.userId, startDate, endDate);
      const totalExpenses = cycleExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      const totalEarnings = baseEarnings + bonusEarnings + otherIncomes;
      const netProfit = totalEarnings - totalExpenses;

      const cycle = await storage.createFinancialCycle({
        userId: req.session.userId,
        accountId: req.session.accountId,
        cycleStart: startDate,
        cycleEnd: endDate,
        deliveriesCount,
        baseEarnings,
        bonusEarnings,
        otherIncomes,
        totalEarnings,
        totalExpenses,
        netProfit,
        status: 'pending',
      });

      res.json(cycle);
    } catch (error) {
      console.error('Close cycle error:', error);
      res.status(500).json({ error: 'Erro ao fechar ciclo' });
    }
  });

  // =====================================================
  // ROTAS DE ADMINISTRADOR
  // =====================================================

  app.post('/api/admin/signup', async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body;
      
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Preencha todos os campos' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
      }

      if (!isSupabaseConfigured()) {
        return res.status(500).json({ error: 'Banco de dados não configurado' });
      }

      const result = await supabaseStorage.createAdmin(email, name, password);
      if ('error' in result) {
        return res.status(400).json({ error: result.error });
      }

      res.status(201).json({ message: 'Administrador criado com sucesso' });
    } catch (error) {
      console.error('Admin signup error:', error);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  app.post('/api/admin/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Preencha todos os campos' });
      }

      if (!isSupabaseConfigured()) {
        return res.status(500).json({ error: 'Banco de dados não configurado' });
      }

      const admin = await supabaseStorage.validateAdminPassword(email, password);
      if (!admin) {
        return res.status(401).json({ error: 'Email ou senha incorretos' });
      }

      (req.session as any).adminId = admin.id;

      res.json({ admin: { id: admin.id, email: admin.email, name: admin.name } });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  app.post('/api/admin/logout', async (req: Request, res: Response) => {
    (req.session as any).adminId = undefined;
    res.json({ success: true });
  });

  app.get('/api/admin/me', async (req: Request, res: Response) => {
    const adminId = (req.session as any).adminId;
    if (!adminId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const admin = await supabaseStorage.getAdmin(adminId);
      if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado' });
      }

      res.json({ admin: { id: admin.id, email: admin.email, name: admin.name } });
    } catch (error) {
      console.error('Admin me error:', error);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  app.get('/api/admin/accounts', async (req: Request, res: Response) => {
    const adminId = (req.session as any).adminId;
    if (!adminId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const accounts = await supabaseStorage.getAllAccountsWithSubscriptions();
      res.json({ accounts });
    } catch (error) {
      console.error('Get accounts error:', error);
      res.status(500).json({ error: 'Erro ao buscar contas' });
    }
  });

  app.get('/api/admin/settings', async (req: Request, res: Response) => {
    const adminId = (req.session as any).adminId;
    if (!adminId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const settings = await supabaseStorage.getAdminSettings();
      res.json(settings);
    } catch (error) {
      console.error('Get admin settings error:', error);
      res.status(500).json({ error: 'Erro ao buscar configuracoes' });
    }
  });

  app.patch('/api/admin/settings', async (req: Request, res: Response) => {
    const adminId = (req.session as any).adminId;
    if (!adminId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const { subscriptionPrice } = req.body;
      
      if (typeof subscriptionPrice !== 'number' || subscriptionPrice <= 0) {
        return res.status(400).json({ error: 'Valor inválido' });
      }

      const updated = await supabaseStorage.updateAdminSettings({ subscriptionPrice });
      res.json(updated);
    } catch (error) {
      console.error('Update admin settings error:', error);
      res.status(500).json({ error: 'Erro ao atualizar configuracoes' });
    }
  });

  app.patch('/api/admin/accounts/:id/trial', async (req: Request, res: Response) => {
    const adminId = (req.session as any).adminId;
    if (!adminId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const accountId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { trialDays } = req.body;

      if (typeof trialDays !== 'number' || trialDays < 0) {
        return res.status(400).json({ error: 'Dias de trial inválidos' });
      }

      const updated = await supabaseStorage.updateAccountTrial(accountId, trialDays);
      if (!updated) {
        return res.status(404).json({ error: 'Conta não encontrada' });
      }

      res.json({ success: true, subscription: updated });
    } catch (error) {
      console.error('Update trial error:', error);
      res.status(500).json({ error: 'Erro ao atualizar trial' });
    }
  });

  app.patch('/api/admin/accounts/:id/subscription', async (req: Request, res: Response) => {
    const adminId = (req.session as any).adminId;
    if (!adminId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const accountId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { plan, daysToAdd } = req.body;

      const updated = await supabaseStorage.updateAccountSubscription(accountId, plan, daysToAdd);
      if (!updated) {
        return res.status(404).json({ error: 'Conta não encontrada' });
      }

      res.json({ success: true, subscription: updated });
    } catch (error) {
      console.error('Update subscription error:', error);
      res.status(500).json({ error: 'Erro ao atualizar assinatura' });
    }
  });

  // =====================================================
  // ROTAS DE PAGAMENTO PIX
  // =====================================================

  app.get('/api/payment/config', async (req: Request, res: Response) => {
    try {
      const { getStripePublishableKey } = await import('./stripeClient');
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error('Get Stripe config error:', error);
      res.status(500).json({ error: 'Erro ao obter configuração de pagamento' });
    }
  });

  app.get('/api/subscription/price', async (req: Request, res: Response) => {
    try {
      const settings = await supabaseStorage.getAdminSettings();
      res.json({ subscriptionPrice: settings.subscriptionPrice });
    } catch (error) {
      res.json({ subscriptionPrice: 29.90 });
    }
  });

  app.post('/api/payment/create-pix', async (req: Request, res: Response) => {
    const logPrefix = `[PIX-PAYMENT ${new Date().toISOString()}]`;
    
    console.log(`${logPrefix} === INICIO CRIACAO PIX ===`);
    console.log(`${logPrefix} UserId: ${req.session.userId}, AccountId: ${req.session.accountId}`);
    
    if (!req.session.userId || !req.session.accountId) {
      console.log(`${logPrefix} ERRO: Usuario nao autenticado`);
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      console.log(`${logPrefix} Passo 1: Carregando Stripe client...`);
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();
      console.log(`${logPrefix} Stripe client carregado com sucesso`);

      console.log(`${logPrefix} Passo 2: Buscando dados do usuario...`);
      const user = await storage.getUser(req.session.userId) as ExtendedUser;
      if (!user) {
        console.log(`${logPrefix} ERRO: Usuario nao encontrado no banco`);
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }
      console.log(`${logPrefix} Usuario: ${user.name} (${user.email})`);

      console.log(`${logPrefix} Passo 3: Buscando configuracoes de preco...`);
      const settings = await supabaseStorage.getAdminSettings();
      const priceInCents = Math.round(settings.subscriptionPrice * 100);
      console.log(`${logPrefix} Preco: R$ ${settings.subscriptionPrice} (${priceInCents} centavos)`);

      console.log(`${logPrefix} Passo 4: Criando PaymentIntent no Stripe...`);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: priceInCents,
        currency: 'brl',
        payment_method_types: ['pix'],
        metadata: {
          accountId: req.session.accountId,
          userId: req.session.userId,
          type: 'subscription',
        },
      });
      console.log(`${logPrefix} PaymentIntent criado: ${paymentIntent.id}`);
      console.log(`${logPrefix} PaymentIntent status: ${paymentIntent.status}`);

      const { taxId } = req.body;
      console.log(`${logPrefix} Passo 5: Criando PaymentMethod (Pix)...`);
      console.log(`${logPrefix} CPF recebido: ${taxId ? taxId.substring(0, 3) + '***' : 'NAO FORNECIDO'}`);
      
      if (!taxId || taxId.length !== 11) {
        console.log(`${logPrefix} ERRO: CPF invalido ou nao fornecido`);
        return res.status(400).json({ error: 'CPF obrigatorio para pagamento Pix' });
      }
      
      const paymentMethod = await stripe.paymentMethods.create({
        type: 'pix',
        billing_details: {
          name: user.name || 'Cliente OptiRota',
          email: user.email,
          address: {
            country: 'BR',
          },
          tax_id: taxId,
        },
      } as any);
      console.log(`${logPrefix} PaymentMethod criado: ${paymentMethod.id}`);

      console.log(`${logPrefix} Passo 6: Confirmando PaymentIntent...`);
      const confirmedIntent = await stripe.paymentIntents.confirm(paymentIntent.id, {
        payment_method: paymentMethod.id,
      });
      console.log(`${logPrefix} PaymentIntent confirmado, status: ${confirmedIntent.status}`);
      console.log(`${logPrefix} next_action type: ${confirmedIntent.next_action?.type || 'NENHUM'}`);

      const pixAction = confirmedIntent.next_action?.pix_display_qr_code;
      
      console.log(`${logPrefix} Passo 7: Verificando dados do QR Code Pix...`);
      console.log(`${logPrefix} - QR Code URL: ${pixAction?.image_url_png ? 'PRESENTE (' + pixAction.image_url_png.substring(0, 50) + '...)' : 'AUSENTE'}`);
      console.log(`${logPrefix} - Codigo Pix (copia-cola): ${pixAction?.data ? 'PRESENTE (' + pixAction.data.substring(0, 30) + '...)' : 'AUSENTE'}`);
      console.log(`${logPrefix} - Expiracao: ${pixAction?.expires_at ? new Date(pixAction.expires_at * 1000).toISOString() : 'AUSENTE'}`);
      
      if (!pixAction) {
        console.log(`${logPrefix} AVISO: next_action completo:`, JSON.stringify(confirmedIntent.next_action, null, 2));
      }

      console.log(`${logPrefix} Passo 8: Salvando pagamento no banco...`);
      await supabaseStorage.createPayment({
        accountId: req.session.accountId,
        stripePaymentIntentId: paymentIntent.id,
        amount: settings.subscriptionPrice,
        currency: 'brl',
        status: 'requires_action',
        pixQrCode: pixAction?.image_url_png || null,
        pixCode: pixAction?.data || null,
        expiresAt: pixAction?.expires_at ? new Date(pixAction.expires_at * 1000).toISOString() : null,
      });
      console.log(`${logPrefix} Pagamento salvo no banco com sucesso`);

      const response = {
        paymentIntentId: paymentIntent.id,
        pixQrCode: pixAction?.image_url_png || null,
        pixCode: pixAction?.data || null,
        expiresAt: pixAction?.expires_at ? new Date(pixAction.expires_at * 1000).toISOString() : null,
      };
      
      console.log(`${logPrefix} === FIM CRIACAO PIX (SUCESSO) ===`);
      console.log(`${logPrefix} Resposta enviada: QR=${!!response.pixQrCode}, Codigo=${!!response.pixCode}`);
      
      res.json(response);
    } catch (error: any) {
      console.error(`${logPrefix} === ERRO NA CRIACAO PIX ===`);
      console.error(`${logPrefix} Tipo: ${error.type || 'N/A'}`);
      console.error(`${logPrefix} Codigo: ${error.code || 'N/A'}`);
      console.error(`${logPrefix} Mensagem: ${error.message}`);
      console.error(`${logPrefix} Param: ${error.param || 'N/A'}`);
      console.error(`${logPrefix} Stack:`, error.stack);
      if (error.raw) {
        console.error(`${logPrefix} Raw error:`, JSON.stringify(error.raw, null, 2));
      }
      res.status(500).json({ error: error.message || 'Erro ao criar pagamento' });
    }
  });

  app.post('/api/payment/confirm-pix', async (req: Request, res: Response) => {
    if (!req.session.userId || !req.session.accountId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ error: 'ID do pagamento não fornecido' });
      }

      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status === 'succeeded') {
        await supabaseStorage.updatePaymentStatus(paymentIntentId, 'succeeded');
        await supabaseStorage.activateSubscription(req.session.accountId, 30);
        
        res.json({ success: true, status: 'succeeded' });
      } else if (paymentIntent.status === 'requires_action') {
        res.json({ success: false, status: 'requires_action' });
      } else {
        res.json({ success: false, status: paymentIntent.status });
      }
    } catch (error) {
      console.error('Confirm Pix payment error:', error);
      res.status(500).json({ error: 'Erro ao confirmar pagamento' });
    }
  });

  app.get('/api/payment/status/:paymentIntentId', async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    try {
      const paymentIntentId = Array.isArray(req.params.paymentIntentId) ? req.params.paymentIntentId[0] : req.params.paymentIntentId;
      
      const { getUncachableStripeClient } = await import('./stripeClient');
      const stripe = await getUncachableStripeClient();

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status === 'succeeded' && req.session.accountId) {
        await supabaseStorage.updatePaymentStatus(paymentIntentId, 'succeeded');
        await supabaseStorage.activateSubscription(req.session.accountId, 30);
      }

      res.json({ status: paymentIntent.status });
    } catch (error) {
      console.error('Get payment status error:', error);
      res.status(500).json({ error: 'Erro ao verificar status do pagamento' });
    }
  });

  // =====================================================
  // BRASILAPI - Busca de CEP com Geolocalização
  // =====================================================

  // Buscar CEP via BrasilAPI V2 (com coordenadas)
  app.get('/api/cep/:cep', async (req: Request, res: Response) => {
    try {
      const cep = req.params.cep as string;
      
      // Limpar e validar CEP
      const cleanCep = cep.replace(/\D/g, '');
      if (cleanCep.length !== 8) {
        return res.status(400).json({ error: 'CEP deve conter 8 dígitos' });
      }

      // Buscar na BrasilAPI V2 (com geolocalização)
      const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: 'CEP não encontrado' });
        }
        throw new Error(`BrasilAPI error: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('BrasilAPI response:', JSON.stringify(data));
      console.log('BrasilAPI location:', data.location ? JSON.stringify(data.location) : 'null');
      
      const responseData = {
        cep: data.cep,
        state: data.state,
        city: data.city,
        neighborhood: data.neighborhood,
        street: data.street,
        service: data.service,
        location: data.location ? {
          latitude: data.location.coordinates?.latitude,
          longitude: data.location.coordinates?.longitude
        } : null
      };
      
      console.log('Sending response:', JSON.stringify(responseData));
      
      // Retornar dados formatados
      res.json(responseData);
    } catch (error: any) {
      console.error('CEP lookup error:', error);
      res.status(500).json({ error: 'Erro ao buscar CEP' });
    }
  });

  // Função para interpolar posição baseada no número da casa
  function interpolateHouseNumber(
    bbox: [string, string, string, string], // [minLat, maxLat, minLon, maxLon]
    houseNumber: number,
    maxHouseNumber: number = 200 // Estimativa do número máximo da rua
  ): { lat: number; lon: number } {
    const minLat = parseFloat(bbox[0]);
    const maxLat = parseFloat(bbox[1]);
    const minLon = parseFloat(bbox[2]);
    const maxLon = parseFloat(bbox[3]);
    
    // Calcular fração baseada no número da casa
    const fraction = Math.min(houseNumber / maxHouseNumber, 1);
    
    // Interpolar posição (números baixos = geralmente início da rua = valores maiores de lat no Brasil)
    // No hemisfério sul, latitudes "maiores" (menos negativas) são mais ao norte
    // Números baixos costumam estar no norte/início da rua
    const lat = maxLat - (maxLat - minLat) * fraction;
    const lon = maxLon - (maxLon - minLon) * fraction;
    
    return { lat, lon };
  }

  // Geocodificação estruturada usando Nominatim (mais precisa)
  app.get('/api/geocode-structured', async (req: Request, res: Response) => {
    try {
      const { street, city, state, postalcode, housenumber } = req.query;
      
      if (!street || typeof street !== 'string') {
        return res.status(400).json({ error: 'Rua é obrigatória' });
      }

      console.log('Structured geocoding:', { street, city, state, postalcode, housenumber });

      // Extrair número da casa do nome da rua se não foi passado separadamente
      let houseNum: number | null = housenumber ? parseInt(housenumber as string) : null;
      let streetName = street;
      
      if (!houseNum) {
        const match = street.match(/^(.+?)\s+(\d+)$/);
        if (match) {
          streetName = match[1];
          houseNum = parseInt(match[2]);
          console.log(`Extracted house number ${houseNum} from street: ${streetName}`);
        }
      }

      // Construir query estruturada para Nominatim
      const params = new URLSearchParams({
        format: 'json',
        street: streetName,
        countrycodes: 'br',
        addressdetails: '1',
        limit: '5'
      });
      
      if (city) params.append('city', city as string);
      if (state) params.append('state', state as string);
      if (postalcode) params.append('postalcode', postalcode as string);
      
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
      console.log('Nominatim structured URL:', nominatimUrl);
      
      const nominatimResponse = await fetch(nominatimUrl, {
        headers: { 'User-Agent': 'OptiRota/1.0' }
      });
      
      if (!nominatimResponse.ok) {
        throw new Error('Erro ao geocodificar endereço');
      }

      let nominatimData = await nominatimResponse.json();
      console.log('Nominatim structured response:', nominatimData);
      
      if (!nominatimData || nominatimData.length === 0) {
        // Fallback: tentar busca livre
        const freeQuery = [street, city, state, 'Brasil'].filter(Boolean).join(', ');
        console.log('Structured search failed, trying free search:', freeQuery);
        
        const freeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(freeQuery)}&countrycodes=br&addressdetails=1&limit=5`;
        
        const freeResponse = await fetch(freeUrl, {
          headers: { 'User-Agent': 'OptiRota/1.0' }
        });
        
        if (freeResponse.ok) {
          nominatimData = await freeResponse.json();
          if (nominatimData && nominatimData.length > 0) {
            console.log('Free search found results:', nominatimData.length);
          } else {
            return res.status(404).json({ error: 'Endereço não encontrado' });
          }
        } else {
          return res.status(404).json({ error: 'Endereço não encontrado' });
        }
      }

      // Se temos um número de casa e bounding box, interpolar a posição
      if (houseNum && nominatimData[0]?.boundingbox) {
        const result = nominatimData[0];
        const bbox = result.boundingbox as [string, string, string, string];
        
        // Calcular extensão da rua
        const latRange = Math.abs(parseFloat(bbox[1]) - parseFloat(bbox[0]));
        const lonRange = Math.abs(parseFloat(bbox[3]) - parseFloat(bbox[2]));
        
        // Só interpolar se a rua tiver extensão significativa
        if (latRange > 0.0001 || lonRange > 0.0001) {
          const interpolated = interpolateHouseNumber(bbox, houseNum);
          console.log(`Interpolated house number ${houseNum}: lat=${interpolated.lat}, lon=${interpolated.lon}`);
          console.log(`Original coords: lat=${result.lat}, lon=${result.lon}`);
          
          // Atualizar coordenadas com valores interpolados
          result.lat = String(interpolated.lat);
          result.lon = String(interpolated.lon);
          result.interpolated = true;
          result.house_number = houseNum;
        }
      }

      res.json(nominatimData);
    } catch (error: any) {
      console.error('Structured geocoding error:', error);
      res.status(500).json({ error: 'Erro ao geocodificar endereço' });
    }
  });

  // Geocodificar endereço e buscar CEP correspondente
  app.get('/api/geocode-address', async (req: Request, res: Response) => {
    try {
      const { address } = req.query;
      
      if (!address || typeof address !== 'string' || address.length < 5) {
        return res.status(400).json({ error: 'Endereço deve ter no mínimo 5 caracteres' });
      }

      // 1. Geocodificar com Nominatim
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=br&addressdetails=1&limit=1`;
      
      const nominatimResponse = await fetch(nominatimUrl, {
        headers: { 'User-Agent': 'OptiRota/1.0' }
      });
      
      if (!nominatimResponse.ok) {
        throw new Error('Erro ao geocodificar endereço');
      }

      const nominatimData = await nominatimResponse.json();
      
      if (!nominatimData || nominatimData.length === 0) {
        return res.status(404).json({ error: 'Endereço não encontrado' });
      }

      const result = nominatimData[0];
      const latitude = parseFloat(result.lat);
      const longitude = parseFloat(result.lon);
      
      // 2. Tentar reverse geocoding para obter CEP
      let cepData = null;
      
      try {
        const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`;
        
        const reverseResponse = await fetch(reverseUrl, {
          headers: { 'User-Agent': 'OptiRota/1.0' }
        });
        
        if (reverseResponse.ok) {
          const reverseData = await reverseResponse.json();
          
          // Se encontrou CEP no reverse geocoding, buscar dados completos na BrasilAPI
          if (reverseData.address?.postcode) {
            const cep = reverseData.address.postcode.replace(/\D/g, '');
            
            if (cep.length === 8) {
              try {
                const brasilApiResponse = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
                if (brasilApiResponse.ok) {
                  cepData = await brasilApiResponse.json();
                }
              } catch {
                // Ignora erro da BrasilAPI
              }
            }
          }
        }
      } catch {
        // Ignora erro do reverse geocoding
      }

      // 3. Montar resposta combinada
      res.json({
        address: result.display_name,
        latitude,
        longitude,
        street: result.address?.road || cepData?.street,
        neighborhood: result.address?.suburb || result.address?.neighbourhood || cepData?.neighborhood,
        city: result.address?.city || result.address?.town || result.address?.village || cepData?.city,
        state: result.address?.state || cepData?.state,
        stateCode: cepData?.state,
        cep: cepData?.cep || result.address?.postcode,
        service: cepData ? 'brasilapi' : 'nominatim'
      });
    } catch (error: any) {
      console.error('Geocode address error:', error);
      res.status(500).json({ error: 'Erro ao geocodificar endereço' });
    }
  });

  // =====================================================
  // LOCALIDADES BRASILEIRAS - Geocodificação Local
  // =====================================================

  // Importar localidades dos arquivos NDJSON
  app.post('/api/admin/localities/import', async (req: Request, res: Response) => {
    // Verificar se é admin
    const adminId = (req.session as any).adminId;
    if (!adminId) {
      return res.status(401).json({ error: 'Acesso restrito a administradores' });
    }

    try {
      const { importLocalitiesFromFiles } = await import('./localitiesImporter');
      const stats = await importLocalitiesFromFiles('./attached_assets');
      res.json({ 
        success: true, 
        message: 'Importação concluída',
        stats 
      });
    } catch (error: any) {
      console.error('Import localities error:', error);
      res.status(500).json({ error: error.message || 'Erro na importação' });
    }
  });

  // Buscar localidades localmente
  app.get('/api/localities/search', async (req: Request, res: Response) => {
    try {
      const { q, state, type, limit } = req.query;
      
      if (!q || typeof q !== 'string' || q.length < 2) {
        return res.status(400).json({ error: 'Termo de busca inválido (mínimo 2 caracteres)' });
      }

      const { searchLocalLocalities } = await import('./localitiesImporter');
      const results = await searchLocalLocalities(q, {
        state: state as string | undefined,
        type: type as 'city' | 'town' | 'village' | 'hamlet' | undefined,
        limit: limit ? parseInt(limit as string) : 10
      });

      // Converter para formato compatível com Nominatim
      const formatted = results.map((loc: any) => ({
        place_id: `local_${loc.id}`,
        lat: String(loc.latitude),
        lon: String(loc.longitude),
        display_name: loc.display_name || `${loc.name}, ${loc.state}, Brasil`,
        address: {
          city: loc.locality_type === 'city' ? loc.name : undefined,
          town: loc.locality_type === 'town' ? loc.name : undefined,
          village: loc.locality_type === 'village' ? loc.name : undefined,
          hamlet: loc.locality_type === 'hamlet' ? loc.name : undefined,
          state: loc.state,
          country: 'Brasil',
          country_code: 'br'
        },
        addresstype: loc.locality_type,
        source: 'local_db',
        population: loc.population
      }));

      res.json(formatted);
    } catch (error: any) {
      console.error('Search localities error:', error);
      res.status(500).json({ error: error.message || 'Erro na busca' });
    }
  });

  // Estatísticas das localidades
  app.get('/api/localities/stats', async (req: Request, res: Response) => {
    try {
      const { getLocalitiesStats } = await import('./localitiesImporter');
      const stats = await getLocalitiesStats();
      
      if (!stats) {
        return res.json({ 
          imported: false, 
          message: 'Nenhum dado de localidades importado ainda' 
        });
      }

      res.json({
        imported: true,
        ...stats
      });
    } catch (error: any) {
      console.error('Get localities stats error:', error);
      res.status(500).json({ error: error.message || 'Erro ao buscar estatísticas' });
    }
  });

  return httpServer;
}

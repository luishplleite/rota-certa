import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Search, MapPin, Loader2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

interface AddressSearchProps {
  onAddressSelect: (address: string, latitude: number, longitude: number) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface SpeechResultItem {
  transcript: string;
  confidence?: number;
}

interface SpeechResult {
  [key: number]: SpeechResultItem;
  isFinal?: boolean;
}

interface SpeechResultList {
  [key: number]: SpeechResult;
  length: number;
}

type SpeechRecognitionType = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: SpeechResultList }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function AddressSearch({ 
  onAddressSelect, 
  isLoading = false,
  placeholder = "CEP ou endereço: 01310-930 ou Av. Paulista, 1000",
  className,
  disabled = false
}: AddressSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  
  // Modal de confirmação
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAddress, setPendingAddress] = useState('');
  const [pendingLatitude, setPendingLatitude] = useState(0);
  const [pendingLongitude, setPendingLongitude] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedAddress, setEditedAddress] = useState('');
  const [nextPackageId, setNextPackageId] = useState<number>(1);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchAddressRef = useRef<((query: string) => void) | null>(null);
  
  const extractedHouseNumberRef = useRef<string | null>(null);
  const extractedComplementRef = useRef<string | null>(null);

  const parseDeliveryAddressFormat = (text: string): { cleanedQuery: string; houseNumber: string | null; complement: string | null } => {
    let trimmedText = text.trim();
    let houseNumber: string | null = null;
    let complement: string | null = null;
    
    // Step 0: Handle semicolon-separated format (e.g., "Bairro;Rua X, Bairro;101 Casa 101 CIDADE SP")
    // This format often has duplicated info - we need to extract the unique parts
    if (trimmedText.includes(';')) {
      const semicolonParts = trimmedText.split(';').map(p => p.trim()).filter(p => p.length > 0);
      
      // Find the part that contains "Rua", "Av", "Alameda", etc. - this is the street
      let streetPart: string | null = null;
      let numberPart: string | null = null;
      let neighborhood: string | null = null;
      
      for (const part of semicolonParts) {
        // Check if this part starts with street type
        if (/^(Rua|Avenida|Av\.?|Alameda|Al\.?|Travessa|Tv\.?|Estrada|Est\.?|Praça|Pç\.?|Largo|Beco|Viela|Rodovia|Rod\.?)\s/i.test(part)) {
          // This is the street part - may include neighborhood after comma
          const commaPos = part.indexOf(',');
          if (commaPos > 0) {
            streetPart = part.substring(0, commaPos).trim();
          } else {
            streetPart = part.trim();
          }
        } 
        // Check if this part is primarily a number with optional complement
        else if (/^\d{1,5}\s/.test(part) || /^\d{1,5}$/.test(part)) {
          // Extract house number
          const numMatch = part.match(/^(\d{1,5})/);
          if (numMatch) {
            numberPart = numMatch[1];
          }
          // Extract complement (Casa X, AP X, etc.)
          const compMatch = part.match(/\b(Casa\s*\d*|AP(?:TO)?\.?\s*\d*|BLOCO?\s*[A-Za-z0-9]*)/i);
          if (compMatch) {
            complement = compMatch[1].trim();
          }
          // Extract city/state from this part
          const cityStateMatch = part.match(/\b([A-Za-zÀ-ÿ]+)\s+([A-Z]{2})\b/);
          if (cityStateMatch) {
            // Will be used later
          }
        }
        // First part is often neighborhood
        else if (!neighborhood && /^[A-Za-zÀ-ÿ\s]+$/.test(part)) {
          neighborhood = part;
        }
      }
      
      // Extract CEP from original text
      const cepMatch = trimmedText.match(/(\d{8}|\d{5}-\d{3})/);
      const cep = cepMatch ? cepMatch[1].replace('-', '') : null;
      
      // Extract city and state from original text
      const cityStateMatch = trimmedText.match(/\b([A-Za-zÀ-ÿ]+)\s+([A-Z]{2})(?:\s|;|$)/);
      const city = cityStateMatch ? cityStateMatch[1] : null;
      const state = cityStateMatch ? cityStateMatch[2] : null;
      
      // Build clean query
      if (streetPart && numberPart) {
        let cleanedQuery = `${streetPart}, ${numberPart}`;
        if (neighborhood && !streetPart.toLowerCase().includes(neighborhood.toLowerCase())) {
          cleanedQuery += `, ${neighborhood}`;
        }
        if (city) cleanedQuery += `, ${city}`;
        if (state) cleanedQuery += `, ${state}`;
        if (cep) cleanedQuery += `, ${cep}`;
        cleanedQuery += ', Brasil';
        
        return { cleanedQuery, houseNumber: numberPart, complement };
      }
    }
    
    // Step 1: Fix number stuck to street name (e.g., "Silveira503" -> "Silveira 503")
    trimmedText = trimmedText.replace(/([a-zA-ZÀ-ÿ])(\d{1,5})(?=\s|,|$)/g, '$1 $2');
    
    // Step 2: Extract and normalize CEP (8 digits with or without dash)
    const cepMatch = trimmedText.match(/(\d{5}-?\d{3})/);
    const cep = cepMatch ? cepMatch[1].replace('-', '') : null;
    
    // Step 3: Detect complements (AP, APTO, CASA, BLOCO, etc.) at various positions
    const complementPatterns = [
      /\b(AP(?:TO)?\.?\s*\d+[A-Za-z]?)\b/i,
      /\b(CASA\s*\d*[A-Za-z]?)\b/i,
      /\b(BLOCO?\s*[A-Za-z0-9]+)\b/i,
      /\b(FUNDOS?)\b/i,
      /\b(LOJA\s*\d*)\b/i,
      /\b(SALA\s*\d*)\b/i,
      /\b(SOBRADO)\b/i,
    ];
    
    for (const pattern of complementPatterns) {
      const match = trimmedText.match(pattern);
      if (match) {
        complement = complement ? `${complement}, ${match[1]}` : match[1];
      }
    }
    
    // Step 4: Remove reference landmarks (RADIO CLUBE, CONDOMINIO, etc.) - they confuse geocoding
    const referencePatterns = [
      /\bRADIO\s+CLUBE\b/gi,
      /\bCONDOMINIO\s+\w+/gi,
      /\bCOND\.?\s+\w+/gi,
      /\bEDIF[IÍ]CIO\s+\w+/gi,
      /\bEDIF\.?\s+\w+/gi,
      /\bPROX(?:IMO)?\s+(?:A[O]?\s+)?[\w\s]+/gi,
    ];
    
    let cleanedForSearch = trimmedText;
    for (const pattern of referencePatterns) {
      cleanedForSearch = cleanedForSearch.replace(pattern, '');
    }
    
    // Step 5: Extract city and state from common patterns (Santos/SP, Santos SP, Santos - SP)
    let city: string | null = null;
    let state: string | null = null;
    
    const cityStatePatterns = [
      /([A-Za-zÀ-ÿ\s]+)[\/\-]\s*([A-Z]{2})\s*$/i,
      /([A-Za-zÀ-ÿ\s]+)\s+([A-Z]{2})\s*$/i,
    ];
    
    for (const pattern of cityStatePatterns) {
      const match = cleanedForSearch.match(pattern);
      if (match && match[1].trim().length > 2) {
        city = match[1].trim();
        state = match[2].toUpperCase();
        cleanedForSearch = cleanedForSearch.replace(pattern, '').trim();
        break;
      }
    }
    
    // Step 6: Clean up extra commas, spaces, and punctuation
    cleanedForSearch = cleanedForSearch
      .replace(/,\s*,+/g, ',')
      .replace(/\s+/g, ' ')
      .replace(/,\s*$/g, '')
      .replace(/^\s*,/g, '')
      .trim();
    
    // Step 7: Check if address contains commas (formatted address)
    if (cleanedForSearch.includes(',')) {
      const parts = cleanedForSearch.split(',').map(p => p.trim()).filter(p => p.length > 0);
      
      // Look for a house number in the parts
      for (let i = 0; i < Math.min(parts.length, 4); i++) {
        const part = parts[i];
        
        // Check if this part is just a house number (1-5 digits, possibly with letter)
        if (/^\d{1,5}[A-Za-z]?$/.test(part)) {
          houseNumber = part;
          break;
        }
        
        // Check if number is at end of street name (e.g., "Rua X 147")
        const endNumberMatch = part.match(/^(.+?)\s+(\d{1,5}[A-Za-z]?)$/);
        if (endNumberMatch) {
          houseNumber = endNumberMatch[2];
          break;
        }
      }
      
      // Rebuild query with city/state if found
      let finalQuery = cleanedForSearch;
      if (city && !finalQuery.toLowerCase().includes(city.toLowerCase())) {
        finalQuery += `, ${city}`;
      }
      if (state && !finalQuery.includes(state)) {
        finalQuery += `, ${state}`;
      }
      if (cep && !finalQuery.includes(cep)) {
        finalQuery += `, ${cep}`;
      }
      finalQuery += ', Brasil';
      
      return { cleanedQuery: finalQuery, houseNumber, complement };
    }
    
    // Pattern 1: With CEP at the end (e.g., "Rua X 147 apto 1 11015031")
    const patternWithCep = /^(.+?)\s+(\d{1,5})\s*(.*?)\s*(\d{8})$/;
    const matchWithCep = cleanedForSearch.match(patternWithCep);
    
    if (matchWithCep) {
      const addressPart = matchWithCep[1].trim();
      houseNumber = matchWithCep[2];
      if (!complement && matchWithCep[3].trim()) {
        complement = matchWithCep[3].trim();
      }
      const extractedCep = matchWithCep[4];
      
      let cleanedQuery = `${addressPart}, ${houseNumber}`;
      if (city) cleanedQuery += `, ${city}`;
      if (state) cleanedQuery += `, ${state}`;
      cleanedQuery += `, ${extractedCep}, Brasil`;
      
      return { cleanedQuery, houseNumber, complement };
    }
    
    // Pattern 2: Without CEP, with city/state (e.g., "Rua Batista Pereira 147 Santos SP")
    const patternWithCity = /^(.+?)\s+(\d{1,5})\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+([A-Z]{2}))?$/i;
    const matchWithCity = cleanedForSearch.match(patternWithCity);
    
    if (matchWithCity) {
      const streetPart = matchWithCity[1].trim();
      houseNumber = matchWithCity[2];
      const cityPart = matchWithCity[3].trim() || city;
      const statePart = matchWithCity[4] ? matchWithCity[4].toUpperCase() : state;
      
      let cleanedQuery = `${streetPart}, ${houseNumber}`;
      if (cityPart) cleanedQuery += `, ${cityPart}`;
      if (statePart) cleanedQuery += `, ${statePart}`;
      if (cep) cleanedQuery += `, ${cep}`;
      cleanedQuery += ', Brasil';
      
      return { cleanedQuery, houseNumber, complement };
    }
    
    // Pattern 3: Just street and number (e.g., "Rua X 147")
    const patternSimple = /^(.+?)\s+(\d{1,5})$/;
    const matchSimple = cleanedForSearch.match(patternSimple);
    
    if (matchSimple) {
      const streetPart = matchSimple[1].trim();
      houseNumber = matchSimple[2];
      
      let cleanedQuery = `${streetPart}, ${houseNumber}`;
      if (city) cleanedQuery += `, ${city}`;
      if (state) cleanedQuery += `, ${state}`;
      if (cep) cleanedQuery += `, ${cep}`;
      cleanedQuery += ', Brasil';
      
      return { cleanedQuery, houseNumber, complement };
    }
    
    // Fallback: just add Brasil to whatever we have
    let cleanedQuery = cleanedForSearch;
    if (city && !cleanedQuery.toLowerCase().includes(city.toLowerCase())) {
      cleanedQuery += `, ${city}`;
    }
    if (state && !cleanedQuery.includes(state)) {
      cleanedQuery += `, ${state}`;
    }
    if (cep && !cleanedQuery.includes(cep)) {
      cleanedQuery += `, ${cep}`;
    }
    if (!cleanedQuery.toLowerCase().includes('brasil')) {
      cleanedQuery += ', Brasil';
    }
    
    return { cleanedQuery, houseNumber: null, complement };
  };

  // Verificar se é um CEP (8 dígitos com ou sem hífen)
  const isCEP = (text: string): boolean => {
    const cleanText = text.replace(/\D/g, '');
    return cleanText.length === 8 && /^\d+$/.test(cleanText);
  };

  // Buscar CEP via BrasilAPI V2 (com geolocalização)
  const searchByCEP = useCallback(async (cep: string): Promise<NominatimResult | null> => {
    try {
      const cleanCep = cep.replace(/\D/g, '');
      const response = await fetch(`/api/cep/${cleanCep}`);
      
      if (!response.ok) {
        // CEP não encontrado - retornar null para tentar busca alternativa
        return null;
      }

      const data = await response.json();
      
      // Converter para formato NominatimResult
      const displayParts = [
        data.street,
        data.neighborhood,
        data.city,
        data.state,
        data.cep
      ].filter(Boolean);

      // Se BrasilAPI não retornou coordenadas, fazer geocodificação pelo endereço
      let latitude = data.location?.latitude?.toString();
      let longitude = data.location?.longitude?.toString();
      
      console.log('BrasilAPI returned location:', data.location);

      if (!latitude || !longitude) {
        console.log('BrasilAPI has no coordinates, falling back to structured geocoding...');
        
        // Usar geocodificação estruturada para maior precisão
        const formattedCep = `${cleanCep.slice(0, 5)}-${cleanCep.slice(5)}`;
        const params = new URLSearchParams({
          street: data.street || '',
          city: data.city || '',
          state: data.state || '',
          postalcode: formattedCep
        });
        
        console.log('Structured geocoding params:', params.toString());
        
        try {
          const geoResponse = await fetch(`/api/geocode-structured?${params.toString()}`);
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            console.log('Structured geocode response:', geoData);
            if (geoData && geoData.length > 0) {
              latitude = geoData[0].lat;
              longitude = geoData[0].lon;
              console.log('Using structured geocode coordinates:', latitude, longitude);
            }
          }
        } catch (err) {
          console.warn('Structured geocode failed:', err);
        }
        
        // Fallback adicional: usar geocodificação normal se estruturada falhar
        if (!latitude || !longitude) {
          console.log('Structured geocoding failed, trying free-form geocoding...');
          const addressQuery = [...displayParts, formattedCep, 'Brasil'].join(', ');
          try {
            const geoResponse = await fetch(`/api/geocode?q=${encodeURIComponent(addressQuery)}`);
            if (geoResponse.ok) {
              const geoData = await geoResponse.json();
              console.log('Free-form geocode response:', geoData);
              if (geoData && geoData.length > 0) {
                latitude = geoData[0].lat;
                longitude = geoData[0].lon;
                console.log('Using free-form geocode coordinates:', latitude, longitude);
              }
            }
          } catch (err) {
            console.warn('Free-form geocode also failed:', err);
          }
        }
      }

      // Se ainda não temos coordenadas, não podemos usar este resultado
      if (!latitude || !longitude) {
        return null;
      }

      return {
        place_id: parseInt(cleanCep),
        display_name: displayParts.join(', ') + ', Brasil',
        lat: latitude,
        lon: longitude,
        type: 'cep',
        address: {
          road: data.street,
          suburb: data.neighborhood,
          city: data.city,
          state: data.state,
          postcode: data.cep,
          country: 'Brasil'
        }
      };
    } catch (error) {
      console.error('CEP search error:', error);
      return null;
    }
  }, []);

  // Estado para mensagem de erro
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchAddress = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setSuggestions([]);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    
    try {
      // Verificar se é um CEP
      if (isCEP(searchQuery)) {
        const cepResult = await searchByCEP(searchQuery);
        if (cepResult) {
          setSuggestions([cepResult]);
          setShowSuggestions(true);
          return;
        } else {
          // CEP não encontrado ou sem coordenadas - tentar geocodificar pelo CEP como texto
          const cleanCep = searchQuery.replace(/\D/g, '');
          const formattedCep = `${cleanCep.slice(0, 5)}-${cleanCep.slice(5)}`;
          
          const response = await fetch(`/api/geocode?q=${encodeURIComponent(formattedCep + ', Brasil')}`);
          if (response.ok) {
            const data: NominatimResult[] = await response.json();
            if (data && data.length > 0) {
              setSuggestions(data);
              setShowSuggestions(true);
              return;
            }
          }
          
          // Se nenhuma busca funcionou, mostrar erro
          setSearchError('CEP não encontrado. Verifique se está correto.');
          setSuggestions([]);
          setShowSuggestions(false);
          return;
        }
      }

      // Busca por endereço normal
      const { cleanedQuery, houseNumber, complement } = parseDeliveryAddressFormat(searchQuery);
      extractedHouseNumberRef.current = houseNumber;
      extractedComplementRef.current = complement;

      const response = await fetch(`/api/geocode?q=${encodeURIComponent(cleanedQuery)}`);
      
      if (response.ok) {
        const data: NominatimResult[] = await response.json();
        if (data && data.length > 0) {
          setSuggestions(data);
          setShowSuggestions(true);
        } else {
          setSearchError('Endereço não encontrado. Tente ser mais específico.');
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      setSearchError('Erro ao buscar endereço. Tente novamente.');
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchByCEP]);

  useEffect(() => {
    searchAddressRef.current = searchAddress;
  }, [searchAddress]);

  useEffect(() => {
    const SpeechRecognitionAPI = (window as { SpeechRecognition?: new () => SpeechRecognitionType; webkitSpeechRecognition?: new () => SpeechRecognitionType }).SpeechRecognition || 
      (window as { webkitSpeechRecognition?: new () => SpeechRecognitionType }).webkitSpeechRecognition;
    
    if (SpeechRecognitionAPI) {
      setSpeechSupported(true);
      recognitionRef.current = new SpeechRecognitionAPI();
      recognitionRef.current.lang = 'pt-BR';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;

      let finalTranscript = '';

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result && result[0]) {
            const transcript = result[0].transcript;
            if (result.isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }
        }

        const displayText = finalTranscript || interimTranscript;
        if (displayText) {
          setQuery(displayText);
        }

        if (finalTranscript && searchAddressRef.current) {
          setIsListening(false);
          searchAddressRef.current(finalTranscript);
          finalTranscript = '';
        }
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        if (finalTranscript && searchAddressRef.current) {
          searchAddressRef.current(finalTranscript);
        }
        setIsListening(false);
        finalTranscript = '';
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchAddress(value);
    }, 400);
  };

  const formatDisplayName = (result: NominatimResult): { primary: string; secondary: string } => {
    const parts = result.display_name.split(',').map(p => p.trim());
    
    // Parts to remove (regions, zones, etc.)
    const removePatterns = [
      /^Região\s/i,
      /^Brasil$/i,
      /Metropolitana/i,
      /Intermediária/i,
      /Imediata/i,
      /^Sudeste$/i,
      /^Nordeste$/i,
      /^Sul$/i,
      /^Norte$/i,
      /^Centro-Oeste$/i,
    ];
    
    // Filter out unnecessary parts
    const cleanedParts = parts.filter(part => {
      return !removePatterns.some(pattern => pattern.test(part));
    });
    
    let primary = cleanedParts.slice(0, 2).join(', ');
    
    // If we have an extracted house number that's not already in the result, show it
    if (extractedHouseNumberRef.current) {
      const firstPart = cleanedParts[0] || '';
      const hasHouseNumber = /\d+/.test(firstPart) || (cleanedParts[1] && /^\d+$/.test(cleanedParts[1]));
      
      if (!hasHouseNumber) {
        // Add the house number to the primary display
        const houseNumber = extractedHouseNumberRef.current;
        const complement = extractedComplementRef.current;
        const numberPart = complement ? `${houseNumber} ${complement}` : houseNumber;
        primary = `${firstPart}, ${numberPart}`;
        if (cleanedParts[1]) {
          primary += `, ${cleanedParts[1]}`;
        }
      }
    }
    
    // Secondary shows city, state, CEP (cleaned)
    const secondary = cleanedParts.slice(2, 5).join(', ');
    return { primary, secondary };
  };

  const cleanAddress = (address: string): string => {
    const parts = address.split(',').map(p => p.trim());
    
    // Parts to remove (regions, zones, etc.)
    const removePatterns = [
      /^Região\s/i,
      /^Brasil$/i,
      /Metropolitana/i,
      /Intermediária/i,
      /Imediata/i,
      /Sudeste$/i,
      /Nordeste$/i,
      /Sul$/i,
      /Norte$/i,
      /Centro-Oeste$/i,
    ];
    
    const cleanedParts = parts.filter(part => {
      return !removePatterns.some(pattern => pattern.test(part));
    });
    
    // Keep: street, number, neighborhood, city, state, CEP
    // Usually: street (0), number (1), neighborhood (2), city (3), state (4), CEP (5)
    // Limit to essential parts (max 5-6 parts)
    const essentialParts = cleanedParts.slice(0, 6);
    
    return essentialParts.join(', ');
  };

  // Buscar próximo ID de pacote
  const fetchNextPackageId = async () => {
    try {
      const response = await fetch('/api/stops', { credentials: 'include' });
      if (response.ok) {
        const stops = await response.json();
        setNextPackageId(stops.length + 1);
      }
    } catch {
      setNextPackageId(1);
    }
  };

  const handleSelectSuggestion = async (result: NominatimResult) => {
    console.log('handleSelectSuggestion - result:', JSON.stringify(result));
    console.log('handleSelectSuggestion - result.lat:', result.lat, 'result.lon:', result.lon);
    const latitude = parseFloat(result.lat);
    const longitude = parseFloat(result.lon);
    console.log('handleSelectSuggestion - parsed latitude:', latitude, 'longitude:', longitude);
    
    // First clean the address to remove unnecessary parts
    let finalAddress = cleanAddress(result.display_name);
    
    // Now add the house number if we extracted one
    if (extractedHouseNumberRef.current) {
      const houseNumber = extractedHouseNumberRef.current;
      const complement = extractedComplementRef.current;
      
      let numberPart = houseNumber;
      if (complement) {
        numberPart = `${houseNumber} ${complement}`;
      }
      
      const addressParts = finalAddress.split(',').map(p => p.trim());
      const firstPart = addressParts[0] || '';
      
      // Check if the second part is a house number (just digits, 1-5 chars)
      const secondPart = addressParts[1] || '';
      const hasHouseNumber = /^\d{1,5}$/.test(secondPart) || /\d+$/.test(firstPart);
      
      if (!hasHouseNumber && addressParts.length > 0) {
        // Insert number after street name
        addressParts.splice(1, 0, numberPart);
        finalAddress = addressParts.join(', ');
      }
      
      extractedHouseNumberRef.current = null;
      extractedComplementRef.current = null;
    }
    
    // Buscar próximo ID e abrir modal de confirmação
    await fetchNextPackageId();
    setPendingAddress(finalAddress);
    setEditedAddress(finalAddress);
    setPendingLatitude(latitude);
    setPendingLongitude(longitude);
    setIsEditing(false);
    setShowConfirmModal(true);
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleConfirmAdd = () => {
    const addressToAdd = isEditing ? editedAddress : pendingAddress;
    onAddressSelect(addressToAdd, pendingLatitude, pendingLongitude);
    setShowConfirmModal(false);
    setPendingAddress('');
    setEditedAddress('');
    setIsEditing(false);
  };

  const handleCancelAdd = () => {
    setShowConfirmModal(false);
    setPendingAddress('');
    setEditedAddress('');
    setIsEditing(false);
  };

  const handleStartEditing = () => {
    setEditedAddress(pendingAddress);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setPendingAddress(editedAddress);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedAddress(pendingAddress);
    setIsEditing(false);
  };

  const toggleVoiceSearch = async () => {
    if (!recognitionRef.current) {
      alert('Reconhecimento de voz nao suportado neste navegador.');
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
      }
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch {
      alert('Permissao de microfone negada. Por favor, permita o acesso ao microfone nas configuracoes do navegador.');
      return;
    }

    setIsListening(true);
    
    try {
      recognitionRef.current.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0]);
    } else if (query.trim()) {
      onAddressSelect(query.trim(), -23.55, -46.63);
      setQuery('');
    }
  };

  return (
    <div className={cn("relative", className)}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            placeholder={disabled ? "Rota finalizada - crie uma nova rota" : placeholder}
            value={query}
            onChange={handleInputChange}
            onFocus={() => !disabled && suggestions.length > 0 && setShowSuggestions(true)}
            className={cn("pl-9 pr-10", disabled && "opacity-50 cursor-not-allowed")}
            disabled={disabled}
            data-testid="input-address"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          )}
        </div>

        {speechSupported && (
          <Button
            type="button"
            variant={isListening ? "destructive" : "outline"}
            size="icon"
            onClick={toggleVoiceSearch}
            className={cn("shrink-0", isListening && "animate-pulse")}
            aria-label={isListening ? "Parar gravação" : "Buscar por voz"}
            disabled={disabled}
            data-testid="button-voice-search"
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}

        <Button 
          type="submit" 
          disabled={disabled || isLoading || !query.trim()}
          className="shrink-0"
          data-testid="button-add-stop"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
        </Button>
      </form>

      {searchError && !showSuggestions && (
        <div className="absolute z-50 w-full mt-1 bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive" data-testid="search-error">
          {searchError}
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div 
          ref={suggestionsRef}
          role="listbox"
          aria-label="Sugestões de endereço"
          className="absolute z-50 w-full mt-1 bg-card border rounded-md shadow-lg max-h-60 overflow-auto"
          data-testid="address-suggestions"
        >
          {suggestions.map((result) => {
            const { primary, secondary } = formatDisplayName(result);
            return (
              <button
                key={result.place_id}
                type="button"
                role="option"
                onClick={() => handleSelectSuggestion(result)}
                className="w-full flex items-start gap-3 p-3 text-left hover-elevate transition-colors border-b last:border-b-0"
                data-testid={`suggestion-${result.place_id}`}
              >
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate" data-testid={`suggestion-text-${result.place_id}`}>{primary}</p>
                  <p className="text-sm text-muted-foreground truncate" data-testid={`suggestion-place-${result.place_id}`}>{secondary}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {isListening && (
        <div className="absolute z-50 w-full mt-1 bg-card border rounded-md shadow-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-destructive">
            <Mic className="h-5 w-5 animate-pulse" />
            <span className="font-medium">Ouvindo...</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Diga o endereço de entrega
          </p>
        </div>
      )}

      {/* Modal de Confirmação */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg">Confirmar Parada</DialogTitle>
            <DialogDescription>
              Verifique se o endereço está correto antes de adicionar
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* ID do Pacote */}
            <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg">
              <div className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-full font-bold text-lg">
                {nextPackageId}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pacote</p>
                <p className="font-medium">#{nextPackageId}</p>
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Endereço</Label>
                {!isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleStartEditing}
                    className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    data-testid="button-edit-address"
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                )}
              </div>
              
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={editedAddress}
                    onChange={(e) => setEditedAddress(e.target.value)}
                    className="min-h-[100px] text-sm"
                    placeholder="Digite o endereço completo"
                    data-testid="input-edit-address"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveEdit}
                      className="flex-1"
                      data-testid="button-save-edit"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                      className="flex-1"
                      data-testid="button-cancel-edit"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm leading-relaxed" data-testid="text-pending-address">
                    {pendingAddress}
                  </p>
                </div>
              )}
            </div>

            {/* Coordenadas */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Lat: {pendingLatitude.toFixed(6)}</span>
              <span>Lon: {pendingLongitude.toFixed(6)}</span>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelAdd}
              className="w-full sm:w-auto"
              data-testid="button-cancel-add"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmAdd}
              disabled={isEditing}
              className="w-full sm:w-auto"
              data-testid="button-confirm-add"
            >
              <MapPin className="h-4 w-4 mr-2" />
              Adicionar Parada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

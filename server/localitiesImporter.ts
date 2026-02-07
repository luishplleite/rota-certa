import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { supabaseAdmin, isSupabaseConfigured } from './supabase';

interface LocalityRecord {
  name: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    state?: string;
    state_district?: string;
    region?: string;
    'ISO3166-2-lvl4'?: string;
    country_code?: string;
  };
  population?: number;
  osm_id?: number;
  osm_type?: string;
  type?: string;
  location?: [number, number];
  bbox?: [number, number, number, number];
}

interface ImportStats {
  total: number;
  cities: number;
  towns: number;
  villages: number;
  hamlets: number;
  errors: number;
}

const BATCH_SIZE = 500;

function extractStateCode(isoCode?: string): string | null {
  if (!isoCode) return null;
  const match = isoCode.match(/BR-([A-Z]{2})/);
  return match ? match[1] : null;
}

async function parseNDJSONFile(
  filePath: string, 
  localityType: string,
  onBatch: (records: any[]) => Promise<void>
): Promise<number> {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let batch: any[] = [];
    let count = 0;
    let processingPromise = Promise.resolve();

    rl.on('line', (line) => {
      if (!line.trim()) return;
      
      try {
        const record: LocalityRecord = JSON.parse(line);
        
        if (!record.name || !record.location) return;
        
        const [longitude, latitude] = record.location;
        
        const locality = {
          name: record.name,
          display_name: record.display_name || null,
          locality_type: localityType,
          state: record.address?.state || null,
          state_code: extractStateCode(record.address?.['ISO3166-2-lvl4']),
          municipality: record.address?.municipality || record.address?.city || record.address?.town || null,
          region: record.address?.region || record.address?.state_district || null,
          latitude,
          longitude,
          population: record.population || null,
          osm_id: record.osm_id || null,
          osm_type: record.osm_type || null,
          bbox_min_lon: record.bbox ? record.bbox[0] : null,
          bbox_min_lat: record.bbox ? record.bbox[1] : null,
          bbox_max_lon: record.bbox ? record.bbox[2] : null,
          bbox_max_lat: record.bbox ? record.bbox[3] : null
        };
        
        batch.push(locality);
        count++;
        
        if (batch.length >= BATCH_SIZE) {
          const currentBatch = [...batch];
          batch = [];
          processingPromise = processingPromise.then(() => onBatch(currentBatch));
        }
      } catch (err) {
        console.error('Error parsing line:', err);
      }
    });

    rl.on('close', async () => {
      if (batch.length > 0) {
        await processingPromise;
        await onBatch(batch);
      }
      resolve(count);
    });

    rl.on('error', reject);
  });
}

async function insertBatch(records: any[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabaseAdmin) {
    console.log(`Would insert ${records.length} records (Supabase not configured)`);
    return;
  }
  
  const { error } = await supabaseAdmin
    .from('brazil_localities')
    .upsert(records, { 
      onConflict: 'osm_id',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error('Insert batch error:', error.message);
    
    for (const record of records) {
      const { error: singleError } = await supabaseAdmin
        .from('brazil_localities')
        .insert(record);
      
      if (singleError && !singleError.message.includes('duplicate')) {
        console.error(`Error inserting ${record.name}:`, singleError.message);
      }
    }
  }
}

export async function importLocalitiesFromFiles(dataDir: string = './attached_assets'): Promise<ImportStats> {
  const stats: ImportStats = {
    total: 0,
    cities: 0,
    towns: 0,
    villages: 0,
    hamlets: 0,
    errors: 0
  };
  
  console.log('Starting localities import from:', dataDir);
  
  const files = [
    { pattern: /place[-_]?city.*\.ndjson$/i, type: 'city', key: 'cities' as const },
    { pattern: /place[-_]?town.*\.ndjson$/i, type: 'town', key: 'towns' as const },
    { pattern: /place[-_]?village.*\.ndjson$/i, type: 'village', key: 'villages' as const },
    { pattern: /place[-_]?hamlet.*\.ndjson$/i, type: 'hamlet', key: 'hamlets' as const },
  ];
  
  try {
    const dirFiles = fs.readdirSync(dataDir);
    
    for (const fileConfig of files) {
      const matchingFile = dirFiles.find(f => fileConfig.pattern.test(f));
      
      if (matchingFile) {
        const filePath = path.join(dataDir, matchingFile);
        console.log(`Processing ${fileConfig.type}: ${matchingFile}`);
        
        const count = await parseNDJSONFile(filePath, fileConfig.type, insertBatch);
        stats[fileConfig.key] = count;
        stats.total += count;
        
        console.log(`  Imported ${count} ${fileConfig.type} records`);
      } else {
        console.log(`No file found for ${fileConfig.type}`);
      }
    }
    
    if (isSupabaseConfigured() && supabaseAdmin) {
      await supabaseAdmin
        .from('localities_metadata')
        .upsert({
          id: 1,
          source: 'Geoapify OSM Localities',
          last_update: new Date().toISOString(),
          total_records: stats.total,
          cities_count: stats.cities,
          towns_count: stats.towns,
          villages_count: stats.villages,
          hamlets_count: stats.hamlets,
          version: new Date().toISOString().split('T')[0],
          notes: 'Imported from NDJSON files'
        }, { onConflict: 'id' });
    }
    
  } catch (err) {
    console.error('Import error:', err);
    stats.errors++;
  }
  
  console.log('Import complete:', stats);
  return stats;
}

export async function searchLocalLocalities(
  searchTerm: string,
  options: {
    state?: string;
    type?: 'city' | 'town' | 'village' | 'hamlet';
    limit?: number;
  } = {}
): Promise<any[]> {
  if (!isSupabaseConfigured() || !supabaseAdmin) {
    return [];
  }
  
  const { state, type, limit = 10 } = options;
  
  let query = supabaseAdmin
    .from('brazil_localities')
    .select('*')
    .ilike('name', `%${searchTerm}%`)
    .order('population', { ascending: false, nullsFirst: false })
    .limit(limit);
  
  if (state) {
    query = query.or(`state.ilike.%${state}%,state_code.eq.${state.toUpperCase()}`);
  }
  
  if (type) {
    query = query.eq('locality_type', type);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Search localities error:', error);
    return [];
  }
  
  return data || [];
}

export async function getLocalitiesStats(): Promise<any> {
  if (!isSupabaseConfigured() || !supabaseAdmin) {
    return null;
  }
  
  const { data, error } = await supabaseAdmin
    .from('localities_metadata')
    .select('*')
    .eq('id', 1)
    .single();
  
  if (error) {
    return null;
  }
  
  return data;
}

export async function downloadAndUpdateLocalities(): Promise<{ success: boolean; message: string }> {
  const GEOAPIFY_LOCALITIES_URL = 'https://data.geoapify.com/osm-localities/v2/brazil/';
  
  console.log('Checking for locality updates from Geoapify...');
  
  try {
    return { 
      success: true, 
      message: 'Para atualizar os dados, baixe os arquivos de https://data.geoapify.com/osm-localities/ e use o endpoint de importação' 
    };
  } catch (err) {
    console.error('Update check error:', err);
    return { success: false, message: 'Erro ao verificar atualizações' };
  }
}

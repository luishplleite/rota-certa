-- =====================================================
-- OptiRota - Tabela de Localidades Brasileiras
-- Dados do OpenStreetMap via Geoapify
-- Execute este SQL no Editor SQL do Supabase
-- =====================================================

-- Habilitar extensão pg_trgm para busca por similaridade PRIMEIRO
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tabela de localidades brasileiras para geocodificação local
CREATE TABLE IF NOT EXISTS brazil_localities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_name TEXT,
    locality_type VARCHAR(50) NOT NULL CHECK (locality_type IN ('city', 'town', 'village', 'hamlet')),
    state VARCHAR(100),
    state_code VARCHAR(10),
    municipality VARCHAR(255),
    region VARCHAR(100),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    population INTEGER,
    osm_id BIGINT UNIQUE,
    osm_type VARCHAR(20),
    bbox_min_lon DOUBLE PRECISION,
    bbox_min_lat DOUBLE PRECISION,
    bbox_max_lon DOUBLE PRECISION,
    bbox_max_lat DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para busca eficiente
CREATE INDEX IF NOT EXISTS idx_localities_name ON brazil_localities USING gin(to_tsvector('portuguese', name));
CREATE INDEX IF NOT EXISTS idx_localities_name_lower ON brazil_localities (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_localities_state ON brazil_localities (state);
CREATE INDEX IF NOT EXISTS idx_localities_type ON brazil_localities (locality_type);
CREATE INDEX IF NOT EXISTS idx_localities_coords ON brazil_localities (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_localities_population ON brazil_localities (population DESC NULLS LAST);
CREATE UNIQUE INDEX IF NOT EXISTS idx_localities_osm_id ON brazil_localities (osm_id) WHERE osm_id IS NOT NULL;

-- Índice espacial para buscas geográficas (requer PostGIS)
-- CREATE INDEX IF NOT EXISTS idx_localities_geom ON brazil_localities USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- Função para buscar localidades por nome
CREATE OR REPLACE FUNCTION search_localities(
    search_term TEXT,
    state_filter TEXT DEFAULT NULL,
    type_filter TEXT DEFAULT NULL,
    limit_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id INTEGER,
    name VARCHAR,
    display_name TEXT,
    locality_type VARCHAR,
    state VARCHAR,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    population INTEGER,
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bl.id,
        bl.name,
        bl.display_name,
        bl.locality_type,
        bl.state,
        bl.latitude,
        bl.longitude,
        bl.population,
        similarity(LOWER(bl.name), LOWER(search_term)) AS similarity
    FROM brazil_localities bl
    WHERE 
        (LOWER(bl.name) LIKE '%' || LOWER(search_term) || '%'
         OR bl.display_name ILIKE '%' || search_term || '%')
        AND (state_filter IS NULL OR bl.state ILIKE '%' || state_filter || '%')
        AND (type_filter IS NULL OR bl.locality_type = type_filter)
    ORDER BY 
        similarity(LOWER(bl.name), LOWER(search_term)) DESC,
        bl.population DESC NULLS LAST
    LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;

-- Tabela de metadados para controle de atualizações
CREATE TABLE IF NOT EXISTS localities_metadata (
    id SERIAL PRIMARY KEY,
    source VARCHAR(100) NOT NULL,
    last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_records INTEGER DEFAULT 0,
    cities_count INTEGER DEFAULT 0,
    towns_count INTEGER DEFAULT 0,
    villages_count INTEGER DEFAULT 0,
    hamlets_count INTEGER DEFAULT 0,
    version VARCHAR(50),
    notes TEXT
);

-- Comentários nas tabelas
COMMENT ON TABLE brazil_localities IS 'Localidades brasileiras (cidades, vilas, villages, hamlets) do OpenStreetMap para geocodificação local';
COMMENT ON TABLE localities_metadata IS 'Metadados de importação e atualização das localidades';

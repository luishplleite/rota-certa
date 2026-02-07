-- =====================================================
-- OptiRota - Micro SaaS Database Schema
-- Execute este SQL no Editor SQL do Supabase
-- =====================================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABELA: accounts (Contas/Empresas)
-- Representa cada conta do micro SaaS
-- =====================================================
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABELA: users (Usuários)
-- Usuários que pertencem a uma conta
-- Autenticação customizada (não usa Supabase Auth)
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user', 'driver')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABELA: subscriptions (Assinaturas)
-- Gerencia o trial de 16 dias e assinaturas
-- =====================================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    plan VARCHAR(50) DEFAULT 'trial' CHECK (plan IN ('trial', 'basic', 'premium', 'enterprise')),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'suspended')),
    trial_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    trial_end_date TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '16 days'),
    paid_start_date TIMESTAMP WITH TIME ZONE,
    paid_end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id)
);

-- =====================================================
-- TABELA: itineraries (Rotas/Itinerários)
-- Rotas de entrega criadas pelos usuários
-- =====================================================
CREATE TABLE itineraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    total_earnings DECIMAL(10, 2) DEFAULT 0,
    total_distance_km DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABELA: stops (Paradas/Entregas)
-- Cada parada de entrega em uma rota
-- =====================================================
CREATE TABLE stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    fixed_identifier VARCHAR(100) NOT NULL,
    address_full TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    sequence_order INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'current', 'delivered', 'failed')),
    delivery_time TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABELA: earnings_history (Histórico de Ganhos)
-- Registro de ganhos diários por usuário
-- =====================================================
CREATE TABLE earnings_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    itinerary_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    deliveries_count INTEGER DEFAULT 0,
    base_earnings DECIMAL(10, 2) DEFAULT 0,
    bonus_earnings DECIMAL(10, 2) DEFAULT 0,
    total_earnings DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- =====================================================
-- TABELA: sessions (Sessões)
-- Gerenciamento de sessões de login
-- =====================================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABELA: stop_counter (Contador de Paradas)
-- Contador global para identificadores de paradas
-- =====================================================
CREATE TABLE stop_counter (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    counter INTEGER DEFAULT 0
);

-- =====================================================
-- ÍNDICES para melhor performance
-- =====================================================
CREATE INDEX idx_users_account_id ON users(account_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_itineraries_account_id ON itineraries(account_id);
CREATE INDEX idx_itineraries_user_id ON itineraries(user_id);
CREATE INDEX idx_itineraries_date ON itineraries(date);
CREATE INDEX idx_itineraries_status ON itineraries(status);
CREATE INDEX idx_stops_itinerary_id ON stops(itinerary_id);
CREATE INDEX idx_stops_account_id ON stops(account_id);
CREATE INDEX idx_stops_status ON stops(status);
CREATE INDEX idx_earnings_history_account_id ON earnings_history(account_id);
CREATE INDEX idx_earnings_history_user_id ON earnings_history(user_id);
CREATE INDEX idx_earnings_history_date ON earnings_history(date);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_subscriptions_account_id ON subscriptions(account_id);

-- =====================================================
-- FUNÇÃO: Atualizar updated_at automaticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =====================================================
-- TRIGGERS para updated_at
-- =====================================================
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_itineraries_updated_at
    BEFORE UPDATE ON itineraries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stops_updated_at
    BEFORE UPDATE ON stops
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNÇÃO: Verificar se trial expirou
-- =====================================================
CREATE OR REPLACE FUNCTION is_trial_expired(p_account_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_subscription RECORD;
BEGIN
    SELECT * INTO v_subscription
    FROM subscriptions
    WHERE account_id = p_account_id;
    
    IF NOT FOUND THEN
        RETURN true;
    END IF;
    
    IF v_subscription.plan = 'trial' THEN
        RETURN v_subscription.trial_end_date < NOW();
    END IF;
    
    IF v_subscription.status != 'active' THEN
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: Obter dias restantes do trial
-- =====================================================
CREATE OR REPLACE FUNCTION get_trial_days_remaining(p_account_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_subscription RECORD;
    v_days INTEGER;
BEGIN
    SELECT * INTO v_subscription
    FROM subscriptions
    WHERE account_id = p_account_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    IF v_subscription.plan != 'trial' THEN
        RETURN -1; -- Indica que tem plano pago
    END IF;
    
    v_days := EXTRACT(DAY FROM (v_subscription.trial_end_date - NOW()));
    
    IF v_days < 0 THEN
        RETURN 0;
    END IF;
    
    RETURN v_days;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: Criar conta com trial automático
-- =====================================================
CREATE OR REPLACE FUNCTION create_account_with_trial(
    p_account_name VARCHAR,
    p_email VARCHAR,
    p_user_name VARCHAR,
    p_password_hash VARCHAR
)
RETURNS TABLE(account_id UUID, user_id UUID) AS $$
DECLARE
    v_account_id UUID;
    v_user_id UUID;
BEGIN
    -- Criar conta
    INSERT INTO accounts (name, email)
    VALUES (p_account_name, p_email)
    RETURNING id INTO v_account_id;
    
    -- Criar assinatura trial de 16 dias
    INSERT INTO subscriptions (account_id, plan, status)
    VALUES (v_account_id, 'trial', 'active');
    
    -- Criar usuário admin
    INSERT INTO users (account_id, email, password_hash, name, role)
    VALUES (v_account_id, p_email, p_password_hash, p_user_name, 'admin')
    RETURNING id INTO v_user_id;
    
    -- Inicializar contador de paradas
    INSERT INTO stop_counter (account_id, counter)
    VALUES (v_account_id, 0);
    
    RETURN QUERY SELECT v_account_id, v_user_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: Incrementar contador de paradas
-- =====================================================
CREATE OR REPLACE FUNCTION increment_stop_counter(p_account_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_counter INTEGER;
BEGIN
    UPDATE stop_counter
    SET counter = counter + 1
    WHERE account_id = p_account_id
    RETURNING counter INTO v_counter;
    
    IF NOT FOUND THEN
        INSERT INTO stop_counter (account_id, counter)
        VALUES (p_account_id, 1)
        RETURNING counter INTO v_counter;
    END IF;
    
    RETURN v_counter;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) - Opcional mas recomendado
-- =====================================================

-- Habilitar RLS nas tabelas principais
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_counter ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para a API (ajuste conforme necessário)
-- Por padrão, permite todas as operações via service_role key

CREATE POLICY "Allow all for service role" ON accounts FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON users FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON subscriptions FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON itineraries FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON stops FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON earnings_history FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON sessions FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON stop_counter FOR ALL USING (true);

-- =====================================================
-- DADOS DE EXEMPLO (Opcional - remova em produção)
-- =====================================================

-- Comentado para produção
-- INSERT INTO accounts (id, name, email) VALUES 
-- ('00000000-0000-0000-0000-000000000001', 'Empresa Demo', 'demo@rotacerta.com');

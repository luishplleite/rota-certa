-- =====================================================
-- OptiRota - Script de Atualização do Banco de Dados
-- Execute este SQL no Editor SQL do Supabase
-- Este script pode ser executado múltiplas vezes com segurança
-- =====================================================

-- Habilitar extensão UUID (se não existir)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CRIAR TABELAS (SE NÃO EXISTIREM)
-- =====================================================

-- Tabela: accounts
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: users
CREATE TABLE IF NOT EXISTS users (
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

-- Tabela: subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
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

-- Tabela: itineraries
CREATE TABLE IF NOT EXISTS itineraries (
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

-- Tabela: stops
CREATE TABLE IF NOT EXISTS stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    fixed_identifier VARCHAR(100) NOT NULL,
    address_full TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    sequence_order INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'current', 'delivered', 'failed')),
    package_count INTEGER DEFAULT 1,
    delivery_time TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    sync_status VARCHAR(20) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'conflict')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: earnings_history
CREATE TABLE IF NOT EXISTS earnings_history (
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

-- Tabela: sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: stop_counter
CREATE TABLE IF NOT EXISTS stop_counter (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    counter INTEGER DEFAULT 0
);

-- Tabela: expenses (Despesas)
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL CHECK (category IN ('fuel', 'food', 'maintenance', 'other')),
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para expenses
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- Tabela: incomes (Outras Rendas)
CREATE TABLE IF NOT EXISTS incomes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL CHECK (category IN ('tip', 'bonus', 'extra_delivery', 'other')),
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para incomes
CREATE INDEX IF NOT EXISTS idx_incomes_user_id ON incomes(user_id);
CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes(date);
CREATE INDEX IF NOT EXISTS idx_incomes_category ON incomes(category);

-- Tabela: financial_cycles (Ciclos Financeiros Quinzenais)
CREATE TABLE IF NOT EXISTS financial_cycles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cycle_start DATE NOT NULL,
    cycle_end DATE NOT NULL,
    deliveries_count INTEGER DEFAULT 0,
    base_earnings DECIMAL(10, 2) DEFAULT 0,
    bonus_earnings DECIMAL(10, 2) DEFAULT 0,
    other_incomes DECIMAL(10, 2) DEFAULT 0,
    total_earnings DECIMAL(10, 2) DEFAULT 0,
    total_expenses DECIMAL(10, 2) DEFAULT 0,
    net_profit DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'paid')),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, cycle_start, cycle_end)
);

-- Índices para financial_cycles
CREATE INDEX IF NOT EXISTS idx_financial_cycles_user_id ON financial_cycles(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_cycles_cycle_start ON financial_cycles(cycle_start);
CREATE INDEX IF NOT EXISTS idx_financial_cycles_status ON financial_cycles(status);

-- =====================================================
-- TABELA DE SINCRONIZAÇÃO OFFLINE
-- =====================================================

-- Tabela: sync_queue (fila de sincronização para modo offline)
CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('stop', 'itinerary', 'expense', 'income')),
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retries INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Índices para sync_queue
CREATE INDEX IF NOT EXISTS idx_sync_queue_account_id ON sync_queue(account_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);

-- Tabela: device_sessions (sessões de dispositivos para sync)
CREATE TABLE IF NOT EXISTS device_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_token VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_id)
);

-- Índices para device_sessions
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id ON device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_device_id ON device_sessions(device_id);

-- =====================================================
-- ADICIONAR COLUNAS NOVAS (SE NÃO EXISTIREM)
-- =====================================================

-- Adicionar coluna notes em stops (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stops' AND column_name = 'notes'
    ) THEN
        ALTER TABLE stops ADD COLUMN notes TEXT;
    END IF;
END $$;

-- Adicionar coluna delivery_time em stops (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stops' AND column_name = 'delivery_time'
    ) THEN
        ALTER TABLE stops ADD COLUMN delivery_time TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Adicionar coluna package_count em stops (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stops' AND column_name = 'package_count'
    ) THEN
        ALTER TABLE stops ADD COLUMN package_count INTEGER DEFAULT 1;
    END IF;
END $$;

-- Adicionar coluna is_active em users (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Adicionar coluna total_distance_km em itineraries (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'itineraries' AND column_name = 'total_distance_km'
    ) THEN
        ALTER TABLE itineraries ADD COLUMN total_distance_km DECIMAL(10, 2) DEFAULT 0;
    END IF;
END $$;

-- Adicionar coluna earning_per_delivery em accounts (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'earning_per_delivery'
    ) THEN
        ALTER TABLE accounts ADD COLUMN earning_per_delivery DECIMAL(10, 2) DEFAULT 2.80;
    END IF;
END $$;

-- Adicionar coluna sunday_bonus_threshold em accounts (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'sunday_bonus_threshold'
    ) THEN
        ALTER TABLE accounts ADD COLUMN sunday_bonus_threshold INTEGER DEFAULT 50;
    END IF;
END $$;

-- Adicionar coluna sunday_bonus_value em accounts (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'sunday_bonus_value'
    ) THEN
        ALTER TABLE accounts ADD COLUMN sunday_bonus_value DECIMAL(10, 2) DEFAULT 100.00;
    END IF;
END $$;

-- Adicionar coluna start_address em accounts (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'start_address'
    ) THEN
        ALTER TABLE accounts ADD COLUMN start_address TEXT;
    END IF;
END $$;

-- Adicionar coluna start_latitude em accounts (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'start_latitude'
    ) THEN
        ALTER TABLE accounts ADD COLUMN start_latitude DOUBLE PRECISION;
    END IF;
END $$;

-- Adicionar coluna start_longitude em accounts (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'start_longitude'
    ) THEN
        ALTER TABLE accounts ADD COLUMN start_longitude DOUBLE PRECISION;
    END IF;
END $$;

-- Adicionar coluna sync_status em stops (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stops' AND column_name = 'sync_status'
    ) THEN
        ALTER TABLE stops ADD COLUMN sync_status VARCHAR(20) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'conflict'));
    END IF;
END $$;

-- Adicionar coluna sync_status em itineraries (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'itineraries' AND column_name = 'sync_status'
    ) THEN
        ALTER TABLE itineraries ADD COLUMN sync_status VARCHAR(20) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'conflict'));
    END IF;
END $$;

-- =====================================================
-- CRIAR ÍNDICES (SE NÃO EXISTIREM)
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_itineraries_account_id ON itineraries(account_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON itineraries(user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_date ON itineraries(date);
CREATE INDEX IF NOT EXISTS idx_itineraries_status ON itineraries(status);
CREATE INDEX IF NOT EXISTS idx_stops_itinerary_id ON stops(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_stops_account_id ON stops(account_id);
CREATE INDEX IF NOT EXISTS idx_stops_status ON stops(status);
CREATE INDEX IF NOT EXISTS idx_earnings_history_account_id ON earnings_history(account_id);
CREATE INDEX IF NOT EXISTS idx_earnings_history_user_id ON earnings_history(user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_history_date ON earnings_history(date);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_subscriptions_account_id ON subscriptions(account_id);

-- =====================================================
-- CRIAR/ATUALIZAR FUNÇÕES
-- =====================================================

-- Função: Atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Função: Verificar se trial expirou
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

-- Função: Obter dias restantes do trial
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
        RETURN -1;
    END IF;
    
    v_days := EXTRACT(DAY FROM (v_subscription.trial_end_date - NOW()));
    
    IF v_days < 0 THEN
        RETURN 0;
    END IF;
    
    RETURN v_days;
END;
$$ LANGUAGE plpgsql;

-- Função: Criar conta com trial automático
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
    INSERT INTO accounts (name, email)
    VALUES (p_account_name, p_email)
    RETURNING id INTO v_account_id;
    
    INSERT INTO subscriptions (account_id, plan, status)
    VALUES (v_account_id, 'trial', 'active');
    
    INSERT INTO users (account_id, email, password_hash, name, role)
    VALUES (v_account_id, p_email, p_password_hash, p_user_name, 'admin')
    RETURNING id INTO v_user_id;
    
    INSERT INTO stop_counter (account_id, counter)
    VALUES (v_account_id, 0);
    
    RETURN QUERY SELECT v_account_id, v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Função: Incrementar contador de paradas
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

-- Função: Resetar contador de paradas (para nova rota)
CREATE OR REPLACE FUNCTION reset_stop_counter(p_account_id UUID)
RETURNS INTEGER AS $$
BEGIN
    UPDATE stop_counter
    SET counter = 0
    WHERE account_id = p_account_id;
    
    IF NOT FOUND THEN
        INSERT INTO stop_counter (account_id, counter)
        VALUES (p_account_id, 0);
    END IF;
    
    RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- CRIAR/ATUALIZAR TRIGGERS
-- =====================================================

-- Remover triggers existentes e recriar
DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS update_itineraries_updated_at ON itineraries;
DROP TRIGGER IF EXISTS update_stops_updated_at ON stops;

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
-- DESABILITAR ROW LEVEL SECURITY (RLS)
-- O sistema usa service_role key que deve ter acesso total
-- =====================================================

ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries DISABLE ROW LEVEL SECURITY;
ALTER TABLE stops DISABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE stop_counter DISABLE ROW LEVEL SECURITY;
ALTER TABLE financial_cycles DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE incomes DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE device_sessions DISABLE ROW LEVEL SECURITY;

-- Remover políticas RLS existentes (limpar configuração anterior)
DROP POLICY IF EXISTS service_role_all_accounts ON accounts;
DROP POLICY IF EXISTS service_role_all_users ON users;
DROP POLICY IF EXISTS service_role_all_subscriptions ON subscriptions;
DROP POLICY IF EXISTS service_role_all_itineraries ON itineraries;
DROP POLICY IF EXISTS service_role_all_stops ON stops;
DROP POLICY IF EXISTS service_role_all_earnings ON earnings_history;
DROP POLICY IF EXISTS service_role_all_sessions ON sessions;
DROP POLICY IF EXISTS service_role_all_counter ON stop_counter;
DROP POLICY IF EXISTS service_role_all_cycles ON financial_cycles;

-- =====================================================
-- GRANT PERMISSÕES COMPLETAS
-- =====================================================

-- Permissões para service_role (backend)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Permissões para postgres (owner)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- Permissões para usuário autenticado (anon/authenticated)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Permissões específicas por tabela para garantir acesso total
GRANT ALL PRIVILEGES ON TABLE accounts TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE users TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE subscriptions TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE itineraries TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE stops TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE earnings_history TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE sessions TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE stop_counter TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE financial_cycles TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE expenses TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE incomes TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE admins TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE admin_settings TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE payments TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE sync_queue TO service_role, postgres;
GRANT ALL PRIVILEGES ON TABLE device_sessions TO service_role, postgres;

-- =====================================================
-- TABELA DE ADMINISTRADORES
-- =====================================================

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para admins
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);

-- Tabela: admin_settings (configurações globais do sistema)
CREATE TABLE IF NOT EXISTS admin_settings (
    key VARCHAR(50) PRIMARY KEY,
    subscription_price NUMERIC(10, 2) DEFAULT 29.90,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir configuração padrão se não existir
INSERT INTO admin_settings (key, subscription_price) 
VALUES ('global', 29.90)
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- TABELA DE PAGAMENTOS PIX
-- =====================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'brl',
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'requires_action', 'succeeded', 'failed', 'expired')),
    pix_qr_code TEXT,
    pix_code TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para payments
CREATE INDEX IF NOT EXISTS idx_payments_account_id ON payments(account_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_id ON payments(stripe_payment_intent_id);

-- Adicionar coluna stripe_customer_id em accounts (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'stripe_customer_id'
    ) THEN
        ALTER TABLE accounts ADD COLUMN stripe_customer_id VARCHAR(255);
    END IF;
END $$;

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    AND table_name IN ('accounts', 'users', 'subscriptions', 'itineraries', 'stops', 'earnings_history', 'sessions', 'stop_counter', 'expenses', 'incomes', 'financial_cycles', 'admins', 'payments', 'sync_queue', 'device_sessions');
    
    IF table_count = 15 THEN
        RAISE NOTICE 'SUCESSO: Todas as 15 tabelas foram criadas/atualizadas corretamente!';
    ELSE
        RAISE WARNING 'AVISO: Apenas % de 15 tabelas foram encontradas.', table_count;
    END IF;
END $$;

-- =====================================================
-- FIM DO SCRIPT DE ATUALIZAÇÃO
-- =====================================================

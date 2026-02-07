-- =============================================================================
-- OptiRota - Script de Permissões Completas para Supabase
-- Execute este script no SQL Editor do Supabase para corrigir problemas de permissão
-- IMPORTANTE: Este script desabilita RLS e dá permissões completas
-- =============================================================================

-- =====================================================
-- PASSO 1: DESABILITAR RLS EM TODAS AS TABELAS
-- =====================================================

ALTER TABLE IF EXISTS accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS itineraries DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stops DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stop_counter DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS earnings_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS incomes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS financial_cycles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admin_settings DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- PASSO 2: REMOVER TODAS AS POLÍTICAS EXISTENTES
-- =====================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
        RAISE NOTICE 'Removida política: % da tabela %', r.policyname, r.tablename;
    END LOOP;
END $$;

-- =====================================================
-- PASSO 3: CONCEDER PERMISSÕES COMPLETAS PARA service_role
-- =====================================================

GRANT ALL PRIVILEGES ON TABLE accounts TO service_role;
GRANT ALL PRIVILEGES ON TABLE users TO service_role;
GRANT ALL PRIVILEGES ON TABLE subscriptions TO service_role;
GRANT ALL PRIVILEGES ON TABLE itineraries TO service_role;
GRANT ALL PRIVILEGES ON TABLE stops TO service_role;
GRANT ALL PRIVILEGES ON TABLE stop_counter TO service_role;
GRANT ALL PRIVILEGES ON TABLE earnings_history TO service_role;
GRANT ALL PRIVILEGES ON TABLE expenses TO service_role;
GRANT ALL PRIVILEGES ON TABLE incomes TO service_role;
GRANT ALL PRIVILEGES ON TABLE financial_cycles TO service_role;
GRANT ALL PRIVILEGES ON TABLE sessions TO service_role;
GRANT ALL PRIVILEGES ON TABLE admins TO service_role;
GRANT ALL PRIVILEGES ON TABLE payments TO service_role;
GRANT ALL PRIVILEGES ON TABLE admin_settings TO service_role;

-- =====================================================
-- PASSO 4: CONCEDER PERMISSÕES PARA authenticated
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE itineraries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE stops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE stop_counter TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE earnings_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE incomes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE financial_cycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin_settings TO authenticated;

-- =====================================================
-- PASSO 5: CONCEDER USO DE SEQUENCES
-- =====================================================

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================
-- PASSO 6: VERIFICAR TABELAS E STATUS
-- =====================================================

DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'PERMISSÕES APLICADAS COM SUCESSO!';
    RAISE NOTICE 'Total de tabelas no schema public: %', table_count;
    RAISE NOTICE '=====================================================';
END $$;

-- Verificar status de RLS
SELECT 
    tablename AS "Tabela",
    CASE WHEN rowsecurity THEN 'SIM' ELSE 'NAO' END AS "RLS Ativo"
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Listar tabelas com suas permissões
SELECT 
    grantee AS "Usuario",
    table_name AS "Tabela",
    string_agg(privilege_type, ', ') AS "Permissões"
FROM information_schema.role_table_grants 
WHERE table_schema = 'public'
AND grantee IN ('service_role', 'authenticated')
GROUP BY grantee, table_name
ORDER BY table_name, grantee;

-- =====================================================
-- PASSO 7: FUNÇÕES RPC PARA CONTADOR DE PACOTES
-- =====================================================

DROP FUNCTION IF EXISTS increment_stop_counter(UUID);
DROP FUNCTION IF EXISTS reset_stop_counter(UUID);

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Conceder permissão para executar as funções
GRANT EXECUTE ON FUNCTION increment_stop_counter(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION increment_stop_counter(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_stop_counter(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION reset_stop_counter(UUID) TO authenticated;

-- =====================================================
-- PASSO 8: TABELAS OFFLINE (sync_queue, device_sessions)
-- =====================================================

ALTER TABLE IF EXISTS sync_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS device_sessions DISABLE ROW LEVEL SECURITY;

GRANT ALL PRIVILEGES ON TABLE sync_queue TO service_role;
GRANT ALL PRIVILEGES ON TABLE device_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sync_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE device_sessions TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Funções RPC e permissões adicionais aplicadas com sucesso!';
END $$;

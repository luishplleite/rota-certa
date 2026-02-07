-- =====================================================
-- OptiRota - Script de Permissões para Supabase
-- Execute este script no SQL Editor do Supabase
-- =====================================================

-- OPÇÃO 1: Desabilitar RLS nas tabelas (mais simples)
-- Isso permite que a Service Role Key acesse tudo sem restrições

ALTER TABLE IF EXISTS accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS itineraries DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stops DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS earnings_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS stop_counter DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS incomes DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- OPÇÃO 2: Se preferir manter RLS ativo, crie policies
-- que permitem acesso total para a service role
-- (Descomente as linhas abaixo se preferir esta opção)
-- =====================================================

/*
-- Primeiro, habilite RLS (se ainda não estiver)
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;

-- Crie policies para service role (acesso total)
CREATE POLICY "Service role full access" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON itineraries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON stops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON earnings_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON stop_counter FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON incomes FOR ALL USING (true) WITH CHECK (true);
*/

-- =====================================================
-- Verificar status atual do RLS em cada tabela
-- =====================================================

SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('accounts', 'users', 'subscriptions', 'itineraries', 'stops', 'earnings_history', 'sessions', 'stop_counter', 'expenses', 'incomes')
ORDER BY tablename;

-- =====================================================
-- Conceder permissões explícitas para o papel authenticated
-- (Necessário para algumas operações)
-- =====================================================

GRANT ALL ON accounts TO authenticated;
GRANT ALL ON users TO authenticated;
GRANT ALL ON subscriptions TO authenticated;
GRANT ALL ON itineraries TO authenticated;
GRANT ALL ON stops TO authenticated;
GRANT ALL ON earnings_history TO authenticated;
GRANT ALL ON sessions TO authenticated;
GRANT ALL ON stop_counter TO authenticated;
GRANT ALL ON expenses TO authenticated;
GRANT ALL ON incomes TO authenticated;

-- Conceder permissões para service_role também
GRANT ALL ON accounts TO service_role;
GRANT ALL ON users TO service_role;
GRANT ALL ON subscriptions TO service_role;
GRANT ALL ON itineraries TO service_role;
GRANT ALL ON stops TO service_role;
GRANT ALL ON earnings_history TO service_role;
GRANT ALL ON sessions TO service_role;
GRANT ALL ON stop_counter TO service_role;
GRANT ALL ON expenses TO service_role;
GRANT ALL ON incomes TO service_role;

-- Conceder permissões em sequências (para IDs auto-incrementados)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

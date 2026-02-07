-- =====================================================
-- OptiRota - Correção de Permissões para earnings_history
-- Execute este SQL no Editor SQL do Supabase
-- =====================================================

-- Dar permissões para a tabela earnings_history
GRANT ALL ON earnings_history TO postgres;
GRANT ALL ON earnings_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON earnings_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON earnings_history TO anon;

-- Dar permissões para a tabela itineraries (para o trigger atualizar)
GRANT ALL ON itineraries TO postgres;
GRANT ALL ON itineraries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON itineraries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON itineraries TO anon;

-- Dar permissões para a tabela stops
GRANT ALL ON stops TO postgres;
GRANT ALL ON stops TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON stops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stops TO anon;

-- Desabilitar RLS temporariamente para earnings_history (para o trigger funcionar)
ALTER TABLE earnings_history DISABLE ROW LEVEL SECURITY;

-- OU criar uma política RLS que permita tudo via service_role
-- (alternativa se quiser manter RLS ativo)
DROP POLICY IF EXISTS "Allow service role full access" ON earnings_history;
CREATE POLICY "Allow service role full access" ON earnings_history
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Verificar se as permissões foram aplicadas
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'earnings_history';

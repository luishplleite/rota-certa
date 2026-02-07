-- Script para liberar permissões RLS no Supabase
-- Este script permite que usuários autenticados e o papel de serviço gerenciem seus próprios dados

-- Habilitar RLS nas tabelas se não estiverem (por segurança, mantemos RLS e criamos políticas)
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para ACCOUNTS (Cada conta vê apenas seus dados)
DROP POLICY IF EXISTS "Users can view their own account" ON accounts;
CREATE POLICY "Users can view their own account" ON accounts
    FOR SELECT USING (id IN (SELECT account_id FROM users WHERE id = auth.uid()));

-- 2. Políticas para ITINERARIES
DROP POLICY IF EXISTS "Users can manage their own itineraries" ON itineraries;
CREATE POLICY "Users can manage their own itineraries" ON itineraries
    FOR ALL USING (user_id::text = auth.uid()::text OR auth.role() = 'service_role');

-- 3. Políticas para STOPS
DROP POLICY IF EXISTS "Users can manage their own stops" ON stops;
CREATE POLICY "Users can manage their own stops" ON stops
    FOR ALL USING (account_id IN (SELECT account_id FROM users WHERE id = auth.uid()) OR auth.role() = 'service_role');

-- 4. Políticas para SUBSCRIPTIONS
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON subscriptions;
CREATE POLICY "Users can view their own subscriptions" ON subscriptions
    FOR SELECT USING (account_id IN (SELECT account_id FROM users WHERE id = auth.uid()) OR auth.role() = 'service_role');

-- 5. Políticas para EXPENSES
DROP POLICY IF EXISTS "Users can manage their own expenses" ON expenses;
CREATE POLICY "Users can manage their own expenses" ON expenses
    FOR ALL USING (user_id::text = auth.uid()::text OR auth.role() = 'service_role');

-- 6. Políticas para INCOMES
DROP POLICY IF EXISTS "Users can manage their own incomes" ON incomes;
CREATE POLICY "Users can manage their own incomes" ON incomes
    FOR ALL USING (user_id::text = auth.uid()::text OR auth.role() = 'service_role');

-- 7. Permitir que o Service Role Key faça TUDO (Backup de segurança para o backend)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

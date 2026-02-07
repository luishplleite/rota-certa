-- =====================================================
-- OptiRota - Script de Funções Financeiras
-- Execute este SQL no Editor SQL do Supabase
-- Este script pode ser executado múltiplas vezes com segurança
-- =====================================================

-- =====================================================
-- CONSTANTES DE NEGÓCIO
-- R$ 2,80 por entrega
-- R$ 100,00 bônus de domingo (se > 50 entregas)
-- =====================================================

-- =====================================================
-- FUNÇÃO: Calcular ganhos de um itinerário
-- Retorna base_earnings, bonus_earnings, total_earnings
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_itinerary_earnings(p_itinerary_id UUID)
RETURNS TABLE(
    delivered_count INTEGER,
    base_earnings DECIMAL(10,2),
    bonus_earnings DECIMAL(10,2),
    total_earnings DECIMAL(10,2)
) AS $$
DECLARE
    v_delivered_count INTEGER;
    v_itinerary_date DATE;
    v_is_sunday BOOLEAN;
    v_base DECIMAL(10,2);
    v_bonus DECIMAL(10,2);
    v_earning_per_delivery DECIMAL(10,2) := 2.80;
    v_sunday_bonus DECIMAL(10,2) := 100.00;
    v_sunday_threshold INTEGER := 50;
BEGIN
    -- Contar entregas concluídas
    SELECT COUNT(*) INTO v_delivered_count
    FROM stops
    WHERE itinerary_id = p_itinerary_id
    AND status = 'delivered';
    
    -- Obter data do itinerário
    SELECT date INTO v_itinerary_date
    FROM itineraries
    WHERE id = p_itinerary_id;
    
    -- Verificar se é domingo (0 = domingo no PostgreSQL)
    v_is_sunday := EXTRACT(DOW FROM v_itinerary_date) = 0;
    
    -- Calcular ganhos base
    v_base := v_delivered_count * v_earning_per_delivery;
    
    -- Calcular bônus de domingo
    IF v_is_sunday AND v_delivered_count > v_sunday_threshold THEN
        v_bonus := v_sunday_bonus;
    ELSE
        v_bonus := 0;
    END IF;
    
    RETURN QUERY SELECT 
        v_delivered_count,
        v_base,
        v_bonus,
        (v_base + v_bonus);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: Atualizar ganhos do itinerário
-- Chamada automaticamente quando uma parada muda de status
-- =====================================================
CREATE OR REPLACE FUNCTION update_itinerary_earnings(p_itinerary_id UUID)
RETURNS VOID AS $$
DECLARE
    v_earnings RECORD;
BEGIN
    -- Calcular ganhos
    SELECT * INTO v_earnings
    FROM calculate_itinerary_earnings(p_itinerary_id);
    
    -- Atualizar total_earnings no itinerário
    UPDATE itineraries
    SET total_earnings = v_earnings.total_earnings,
        updated_at = NOW()
    WHERE id = p_itinerary_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: Registrar/Atualizar histórico de ganhos diário
-- =====================================================
CREATE OR REPLACE FUNCTION update_daily_earnings(
    p_account_id UUID,
    p_user_id UUID,
    p_itinerary_id UUID,
    p_date DATE
)
RETURNS VOID AS $$
DECLARE
    v_earnings RECORD;
BEGIN
    -- Calcular ganhos do itinerário
    SELECT * INTO v_earnings
    FROM calculate_itinerary_earnings(p_itinerary_id);
    
    -- Inserir ou atualizar histórico de ganhos
    INSERT INTO earnings_history (
        account_id,
        user_id,
        itinerary_id,
        date,
        deliveries_count,
        base_earnings,
        bonus_earnings,
        total_earnings
    ) VALUES (
        p_account_id,
        p_user_id,
        p_itinerary_id,
        p_date,
        v_earnings.delivered_count,
        v_earnings.base_earnings,
        v_earnings.bonus_earnings,
        v_earnings.total_earnings
    )
    ON CONFLICT (user_id, date) 
    DO UPDATE SET
        deliveries_count = EXCLUDED.deliveries_count,
        base_earnings = EXCLUDED.base_earnings,
        bonus_earnings = EXCLUDED.bonus_earnings,
        total_earnings = EXCLUDED.total_earnings;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGER: Atualizar ganhos quando parada muda de status
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_update_earnings_on_stop_change()
RETURNS TRIGGER AS $$
DECLARE
    v_itinerary RECORD;
BEGIN
    -- Só processar se o status mudou para 'delivered' ou saiu de 'delivered'
    IF (TG_OP = 'UPDATE' AND (NEW.status = 'delivered' OR OLD.status = 'delivered')) 
       OR (TG_OP = 'INSERT' AND NEW.status = 'delivered')
       OR (TG_OP = 'DELETE' AND OLD.status = 'delivered') THEN
        
        -- Obter informações do itinerário
        SELECT i.*, u.id as user_id INTO v_itinerary
        FROM itineraries i
        JOIN users u ON u.account_id = i.account_id
        WHERE i.id = COALESCE(NEW.itinerary_id, OLD.itinerary_id);
        
        IF FOUND THEN
            -- Atualizar ganhos do itinerário
            PERFORM update_itinerary_earnings(v_itinerary.id);
            
            -- Atualizar histórico de ganhos diário
            PERFORM update_daily_earnings(
                v_itinerary.account_id,
                v_itinerary.user_id,
                v_itinerary.id,
                v_itinerary.date
            );
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Remover trigger existente e recriar
DROP TRIGGER IF EXISTS trigger_earnings_on_stop_change ON stops;

CREATE TRIGGER trigger_earnings_on_stop_change
    AFTER INSERT OR UPDATE OR DELETE ON stops
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_earnings_on_stop_change();

-- =====================================================
-- FUNÇÃO: Obter ganhos totais do dia para um usuário
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_daily_earnings(
    p_user_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    deliveries_count INTEGER,
    base_earnings DECIMAL(10,2),
    bonus_earnings DECIMAL(10,2),
    total_earnings DECIMAL(10,2),
    is_sunday BOOLEAN,
    bonus_eligible BOOLEAN
) AS $$
DECLARE
    v_count INTEGER := 0;
    v_base DECIMAL(10,2) := 0;
    v_bonus DECIMAL(10,2) := 0;
    v_is_sunday BOOLEAN;
    v_earning_per_delivery DECIMAL(10,2) := 2.80;
    v_sunday_bonus DECIMAL(10,2) := 100.00;
    v_sunday_threshold INTEGER := 50;
BEGIN
    -- Verificar se é domingo
    v_is_sunday := EXTRACT(DOW FROM p_date) = 0;
    
    -- Contar todas as entregas do dia
    SELECT COALESCE(SUM(eh.deliveries_count), 0)::INTEGER,
           COALESCE(SUM(eh.base_earnings), 0),
           COALESCE(SUM(eh.bonus_earnings), 0)
    INTO v_count, v_base, v_bonus
    FROM earnings_history eh
    WHERE eh.user_id = p_user_id
    AND eh.date = p_date;
    
    -- Se não houver registro, calcular diretamente das paradas
    IF v_count = 0 THEN
        SELECT COUNT(*)::INTEGER INTO v_count
        FROM stops s
        JOIN itineraries i ON i.id = s.itinerary_id
        WHERE i.user_id = p_user_id
        AND i.date = p_date
        AND s.status = 'delivered';
        
        v_base := v_count * v_earning_per_delivery;
        
        IF v_is_sunday AND v_count > v_sunday_threshold THEN
            v_bonus := v_sunday_bonus;
        END IF;
    END IF;
    
    RETURN QUERY SELECT 
        v_count,
        v_base,
        v_bonus,
        (v_base + v_bonus),
        v_is_sunday,
        (v_is_sunday AND v_count > v_sunday_threshold);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: Obter resumo financeiro semanal
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_weekly_earnings(
    p_user_id UUID,
    p_week_start DATE DEFAULT (CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER)
)
RETURNS TABLE(
    week_start DATE,
    week_end DATE,
    total_deliveries INTEGER,
    total_base DECIMAL(10,2),
    total_bonus DECIMAL(10,2),
    total_earnings DECIMAL(10,2),
    days_worked INTEGER
) AS $$
DECLARE
    v_week_end DATE := p_week_start + 6;
BEGIN
    RETURN QUERY
    SELECT 
        p_week_start,
        v_week_end,
        COALESCE(SUM(eh.deliveries_count), 0)::INTEGER,
        COALESCE(SUM(eh.base_earnings), 0),
        COALESCE(SUM(eh.bonus_earnings), 0),
        COALESCE(SUM(eh.total_earnings), 0),
        COUNT(DISTINCT eh.date)::INTEGER
    FROM earnings_history eh
    WHERE eh.user_id = p_user_id
    AND eh.date BETWEEN p_week_start AND v_week_end;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNÇÃO: Obter resumo financeiro mensal
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_monthly_earnings(
    p_user_id UUID,
    p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
)
RETURNS TABLE(
    year INTEGER,
    month INTEGER,
    total_deliveries INTEGER,
    total_base DECIMAL(10,2),
    total_bonus DECIMAL(10,2),
    total_earnings DECIMAL(10,2),
    days_worked INTEGER,
    avg_daily_earnings DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p_year,
        p_month,
        COALESCE(SUM(eh.deliveries_count), 0)::INTEGER,
        COALESCE(SUM(eh.base_earnings), 0),
        COALESCE(SUM(eh.bonus_earnings), 0),
        COALESCE(SUM(eh.total_earnings), 0),
        COUNT(DISTINCT eh.date)::INTEGER,
        CASE 
            WHEN COUNT(DISTINCT eh.date) > 0 
            THEN ROUND(COALESCE(SUM(eh.total_earnings), 0) / COUNT(DISTINCT eh.date), 2)
            ELSE 0
        END
    FROM earnings_history eh
    WHERE eh.user_id = p_user_id
    AND EXTRACT(YEAR FROM eh.date) = p_year
    AND EXTRACT(MONTH FROM eh.date) = p_month;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ÍNDICES ADICIONAIS PARA PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_earnings_history_user_date ON earnings_history(user_id, date);
CREATE INDEX IF NOT EXISTS idx_stops_itinerary_status ON stops(itinerary_id, status);
CREATE INDEX IF NOT EXISTS idx_itineraries_user_date ON itineraries(user_id, date);

-- =====================================================
-- RECALCULAR GANHOS EXISTENTES (Executar uma vez)
-- =====================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM itineraries WHERE status = 'active' LOOP
        PERFORM update_itinerary_earnings(r.id);
    END LOOP;
    RAISE NOTICE 'Ganhos recalculados para todos os itinerários ativos.';
END $$;

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================
DO $$
DECLARE
    func_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO func_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN (
        'calculate_itinerary_earnings',
        'update_itinerary_earnings',
        'update_daily_earnings',
        'get_user_daily_earnings',
        'get_user_weekly_earnings',
        'get_user_monthly_earnings',
        'trigger_update_earnings_on_stop_change'
    );
    
    IF func_count >= 6 THEN
        RAISE NOTICE 'SUCESSO: Funções financeiras criadas/atualizadas corretamente!';
    ELSE
        RAISE WARNING 'AVISO: Apenas % funções foram encontradas.', func_count;
    END IF;
END $$;

-- =====================================================
-- FIM DO SCRIPT DE FUNÇÕES FINANCEIRAS
-- =====================================================

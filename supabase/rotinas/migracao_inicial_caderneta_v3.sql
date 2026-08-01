-- =====================================================================
-- ROTINA ADMINISTRATIVA: migracao_inicial_caderneta_v3
-- NÃO é uma migration estrutural. Executar manualmente apenas quando solicitado.
--
-- Objetivo: criar pagamentos mensais consolidados em public.pagamentos
-- (origem = 'migracao_v2') preservando exatamente a dívida mensal da V2.
--
-- Regra: pagamento_inicial = compras em caderneta do mês - dívida V2 do mês
--        (equivale ao consumo FIFO dos abatimentos naquele mês)
-- Só grava quando pagamento_inicial > 0. Ignora PIX e visitantes.
--
-- Transacional (DO block = uma transação), idempotente e auditável.
--
-- REVERSÃO (executar manualmente, nunca automática):
--   DELETE FROM public.pagamentos WHERE origem = 'migracao_v2';
-- =====================================================================
DO $$
DECLARE
  v_manuais int;
  v_ja int;
  v_sem_merc int;
  v_div int;
  v_inseridos int;
  v_total numeric;
  v_esperados int;
BEGIN
  -- 1. Nenhum pagamento manual pode existir
  SELECT count(*) INTO v_manuais FROM public.pagamentos WHERE origem = 'manual_admin';
  IF v_manuais > 0 THEN
    RAISE EXCEPTION 'Existem % pagamentos com origem manual_admin. Execucao interrompida.', v_manuais;
  END IF;

  -- Prévia recalculada
  CREATE TEMP TABLE previa ON COMMIT DROP AS
  WITH base AS (
    SELECT c.cliente_id,
           to_char(c.data_compra AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') AS mes,
           coalesce(sum(c.valor_total) FILTER (WHERE c.forma_pagamento = 'caderneta' AND c.paga = false), 0) AS compras
    FROM public.compras c
    WHERE c.eh_visitante = false
    GROUP BY 1,2
  ), m AS (
    SELECT cliente_id, mes, compras,
           coalesce(sum(compras) OVER (PARTITION BY cliente_id ORDER BY mes
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prefix
    FROM base
  ), a AS (
    SELECT cliente_id, sum(valor) AS total_abat FROM public.abatimentos GROUP BY 1
  )
  SELECT m.cliente_id,
         (m.mes || '-01')::date AS mes_referencia,
         m.compras,
         least(m.compras, greatest(coalesce(a.total_abat,0) - m.prefix, 0)) AS pagamento
  FROM m LEFT JOIN a ON a.cliente_id = m.cliente_id;

  -- 2. Divergências matemáticas
  SELECT count(*) INTO v_div FROM previa
  WHERE compras < 0 OR pagamento < 0 OR pagamento > compras
     OR mes_referencia <> date_trunc('month', mes_referencia)::date;
  IF v_div > 0 THEN
    RAISE EXCEPTION 'Divergencias matematicas na previa: %', v_div;
  END IF;

  -- 5. mercadinho_id válido
  SELECT count(*) INTO v_sem_merc
  FROM previa p JOIN public.clientes cl ON cl.id = p.cliente_id
  WHERE p.pagamento > 0 AND cl.mercadinho_id IS NULL;
  IF v_sem_merc > 0 THEN
    RAISE EXCEPTION 'Existem % clientes sem mercadinho_id. Rollback integral.', v_sem_merc;
  END IF;

  -- 4. Carga anterior
  SELECT count(*) INTO v_ja FROM public.pagamentos WHERE origem = 'migracao_v2';
  RAISE NOTICE 'Registros migracao_v2 existentes antes: %', v_ja;

  -- Inserção idempotente
  INSERT INTO public.pagamentos
    (cliente_id, mercadinho_id, mes_referencia, valor, forma_pagamento,
     forma_pagamento_outro, observacao, origem, cancelado, criado_por, criado_em)
  SELECT p.cliente_id, cl.mercadinho_id, p.mes_referencia, round(p.pagamento, 2), 'Outro',
         'Migração da Caderneta V2', 'Carga inicial consolidada da Caderneta V3.',
         'migracao_v2', false, NULL, now()
  FROM previa p
  JOIN public.clientes cl ON cl.id = p.cliente_id
  WHERE p.pagamento > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.pagamentos pg
      WHERE pg.cliente_id = p.cliente_id
        AND pg.mes_referencia = p.mes_referencia
        AND pg.origem = 'migracao_v2'
        AND pg.cancelado = false
    );
  GET DIAGNOSTICS v_inseridos = ROW_COUNT;

  -- Validação pós-carga (tabelas): compras - pagamentos V3 = dívida V2
  SELECT count(*) INTO v_div
  FROM (
    SELECT p.cliente_id, p.mes_referencia, p.compras, p.pagamento,
           coalesce((SELECT sum(pg.valor) FROM public.pagamentos pg
                     WHERE pg.cliente_id = p.cliente_id
                       AND pg.mes_referencia = p.mes_referencia
                       AND pg.cancelado = false), 0) AS pago_v3
    FROM previa p
  ) x
  WHERE round(x.compras - x.pago_v3, 2) <> round(x.compras - x.pagamento, 2);
  IF v_div > 0 THEN
    RAISE EXCEPTION 'Validacao pos-carga falhou em % linhas. Rollback integral.', v_div;
  END IF;

  SELECT count(*) INTO v_esperados FROM previa WHERE pagamento > 0;
  SELECT count(*), coalesce(round(sum(valor),2),0) INTO v_ja, v_total
  FROM public.pagamentos WHERE origem = 'migracao_v2' AND cancelado = false;
  IF v_ja <> v_esperados THEN
    RAISE EXCEPTION 'Quantidade migrada (%) difere da previa (%). Rollback.', v_ja, v_esperados;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pagamentos WHERE origem='migracao_v2'
             AND (valor <= 0 OR mes_referencia <> date_trunc('month', mes_referencia)::date)) THEN
    RAISE EXCEPTION 'Pagamento invalido gravado. Rollback integral.';
  END IF;

  RAISE NOTICE 'Inseridos: % | Total migracao_v2: % | Valor: %', v_inseridos, v_ja, v_total;
END $$;

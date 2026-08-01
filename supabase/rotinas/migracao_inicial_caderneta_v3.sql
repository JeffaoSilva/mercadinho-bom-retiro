-- =====================================================================
-- ROTINA ADMINISTRATIVA: migracao_inicial_caderneta_v3
-- NÃO é uma migration estrutural. Executar manualmente apenas quando autorizado.
--
-- Objetivo: criar pagamentos mensais consolidados em public.pagamentos
-- (origem = 'migracao_v2') preservando exatamente a dívida mensal da V2.
--
-- Prévia: TODAS as compras em caderneta (nao visitante), inclusive as ja
--         marcadas com paga = true, de TODOS os clientes (ativos e inativos),
--         cruzadas com a divida mensal atual (saldo_mes) da cliente_caderneta_v2.
-- Regra:  pagamento_inicial = total de compras do mes - saldo_mes (divida V2)
--         Grava somente quando pagamento_inicial > 0.
--         Meses quitados via paga = true tambem entram (divida V2 = 0),
--         gerando pagamento igual ao total de compras do mes.
--         PIX e visitantes ficam de fora pelo proprio filtro das compras.

--
-- Transacional (DO block = 1 transação), idempotente e auditável.
--
-- REVERSÃO (manual, nunca automática):
--   DELETE FROM public.pagamentos WHERE origem = 'migracao_v2';
-- =====================================================================
DO $$
DECLARE
  v_manuais        int;
  v_existentes     int;
  v_cancelados     int;
  v_sem_merc       int;
  v_div            int;
  v_inseridos      int;
  v_ignorados      int;
  v_total          numeric;
  v_esperados      int;
  v_clientes       int;
  v_meses          int;
  v_sugerido       numeric;
BEGIN
  ------------------------------------------------------------------
  -- 1) Nenhum pagamento manual pode existir
  ------------------------------------------------------------------
  SELECT count(*) INTO v_manuais FROM public.pagamentos WHERE origem = 'manual_admin';
  IF v_manuais > 0 THEN
    RAISE EXCEPTION 'Existem % pagamento(s) com origem manual_admin. Execucao interrompida, nada foi inserido.', v_manuais;
  END IF;

  ------------------------------------------------------------------
  -- 2) Carga anterior (inclusive cancelada)
  ------------------------------------------------------------------
  SELECT count(*) FILTER (WHERE true),
         count(*) FILTER (WHERE cancelado = true)
    INTO v_existentes, v_cancelados
  FROM public.pagamentos WHERE origem = 'migracao_v2';

  IF v_cancelados > 0 THEN
    RAISE EXCEPTION 'Inconsistencia: existem % registro(s) migracao_v2 CANCELADOS. Execucao interrompida para analise manual.', v_cancelados;
  END IF;
  RAISE NOTICE 'Registros migracao_v2 existentes antes da execucao: %', v_existentes;

  ------------------------------------------------------------------
  -- 3) Prévia recalculada: TODAS as compras em caderneta (inclusive paga = true)
  --    cruzadas com a divida mensal atual da V2 (saldo_mes; 0 quando o mes
  --    nao aparece mais na V2 por ja estar quitado via paga = true)
  ------------------------------------------------------------------
  CREATE TEMP TABLE previa ON COMMIT DROP AS
  WITH cli AS (
    SELECT id, mercadinho_id FROM public.clientes
  ),
  r AS (
    SELECT c.id AS cliente_id, c.mercadinho_id, public.cliente_caderneta_v2(c.id) AS j FROM cli c
  ),
  mm AS (
    SELECT r.cliente_id,
           (m->>'mes')                AS mes,
           (m->>'saldo_mes')::numeric AS divida_v2
    FROM r, jsonb_array_elements(r.j->'meses') m
  ),
  ct AS (
    SELECT c.cliente_id,
           to_char(c.data_compra AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') AS mes,
           sum(c.valor_total) AS compras
    FROM public.compras c
    WHERE c.eh_visitante = false
      AND c.forma_pagamento = 'caderneta'
      AND c.cliente_id IS NOT NULL
    GROUP BY 1, 2
  ),
  base AS (
    SELECT coalesce(ct.cliente_id, mm.cliente_id) AS cliente_id,
           coalesce(ct.mes, mm.mes)               AS mes,
           coalesce(ct.compras, 0)                AS compras,
           coalesce(mm.divida_v2, 0)              AS divida_v2
    FROM ct
    FULL OUTER JOIN mm ON mm.cliente_id = ct.cliente_id AND mm.mes = ct.mes
  )
  SELECT b.cliente_id,
         cli.mercadinho_id,
         b.mes,
         ((b.mes || '-01')::date) AS mes_referencia,
         b.compras,
         b.divida_v2,
         greatest(b.compras - b.divida_v2, 0) AS pagamento,
         (b.compras < 0 OR b.divida_v2 < 0 OR b.divida_v2 > b.compras) AS divergencia
  FROM base b
  JOIN cli ON cli.id = b.cliente_id
  WHERE NOT (b.compras = 0 AND b.divida_v2 = 0);

  ------------------------------------------------------------------
  -- 4) Conferência obrigatória contra os números já validados
  ------------------------------------------------------------------
  SELECT count(DISTINCT cliente_id), count(*), round(sum(pagamento),2),
         count(*) FILTER (WHERE divergencia)
    INTO v_clientes, v_meses, v_sugerido, v_div
  FROM previa;

  IF v_clientes <> 22 THEN
    RAISE EXCEPTION 'Previa divergente: % clientes (esperado 22). Nada foi inserido.', v_clientes;
  END IF;
  IF v_meses <> 63 THEN
    RAISE EXCEPTION 'Previa divergente: % meses (esperado 63). Nada foi inserido.', v_meses;
  END IF;
  IF v_sugerido <> 3164.38 THEN
    RAISE EXCEPTION 'Previa divergente: total sugerido % (esperado 3164.38). Nada foi inserido.', v_sugerido;
  END IF;
  IF v_div <> 0 THEN
    RAISE EXCEPTION 'Previa possui % divergencia(s) matematica(s) (esperado 0). Nada foi inserido.', v_div;
  END IF;


  -- datas sempre no primeiro dia do mês
  IF EXISTS (SELECT 1 FROM previa WHERE mes_referencia <> date_trunc('month', mes_referencia)::date) THEN
    RAISE EXCEPTION 'Previa contem mes_referencia fora do primeiro dia do mes. Nada foi inserido.';
  END IF;

  ------------------------------------------------------------------
  -- 5) Todos os clientes precisam de mercadinho_id válido
  ------------------------------------------------------------------
  SELECT count(DISTINCT cliente_id) INTO v_sem_merc
  FROM previa WHERE pagamento > 0 AND mercadinho_id IS NULL;
  IF v_sem_merc > 0 THEN
    RAISE EXCEPTION 'Existem % cliente(s) sem mercadinho_id. Rollback integral.', v_sem_merc;
  END IF;

  ------------------------------------------------------------------
  -- 6) Inserção idempotente
  ------------------------------------------------------------------
  SELECT count(*) INTO v_esperados FROM previa WHERE pagamento > 0;

  INSERT INTO public.pagamentos
    (cliente_id, mercadinho_id, mes_referencia, valor, forma_pagamento,
     forma_pagamento_outro, observacao, origem, cancelado,
     cancelado_em, cancelado_por, observacao_cancelamento, criado_por, criado_em)
  SELECT p.cliente_id, p.mercadinho_id, p.mes_referencia, round(p.pagamento, 2), 'Outro',
         'Migração da Caderneta V2', 'Carga inicial consolidada da Caderneta V3.',
         'migracao_v2', false, NULL, NULL, NULL, NULL, now()
  FROM previa p
  WHERE p.pagamento > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.pagamentos pg
      WHERE pg.cliente_id     = p.cliente_id
        AND pg.mes_referencia = p.mes_referencia
        AND pg.origem         = 'migracao_v2'
        AND pg.cancelado      = false
    );
  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  v_ignorados := v_esperados - v_inseridos;
  RAISE NOTICE 'Pagamentos inseridos: % | ignorados por ja existirem: %', v_inseridos, v_ignorados;

  ------------------------------------------------------------------
  -- 7) Validação pós-carga A: por cliente e mês, direto nas tabelas
  --    compras (caderneta, nao paga, nao visitante) - pagamentos V3
  --    deve ser igual ao saldo_mes retornado por cliente_caderneta_v2
  ------------------------------------------------------------------
  SELECT count(*) INTO v_div
  FROM (
    SELECT p.cliente_id, p.mes, p.divida_v2,
           coalesce((
             SELECT sum(c.valor_total)
             FROM public.compras c
             WHERE c.cliente_id = p.cliente_id
               AND c.eh_visitante = false
               AND c.forma_pagamento = 'caderneta'
               AND c.paga = false
               AND to_char(c.data_compra AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') = p.mes
           ), 0) AS compras_tab,
           coalesce((
             SELECT sum(pg.valor) FROM public.pagamentos pg
             WHERE pg.cliente_id = p.cliente_id
               AND pg.mes_referencia = p.mes_referencia
               AND pg.cancelado = false
           ), 0) AS pagos_v3
    FROM previa p
  ) x
  WHERE round(x.compras_tab - x.pagos_v3, 2) <> round(x.divida_v2, 2);
  IF v_div > 0 THEN
    RAISE EXCEPTION 'Validacao por cliente/mes falhou em % linha(s). Rollback integral.', v_div;
  END IF;

  ------------------------------------------------------------------
  -- 8) Validação pós-carga B: total_devido (V3) x total_devido_atual (V2)
  ------------------------------------------------------------------
  SELECT count(*) INTO v_div
  FROM (
    SELECT cl.id,
           round((public.cliente_caderneta_v2(cl.id)->>'total_devido_atual')::numeric, 2) AS v2,
           round((public.cliente_caderneta_v3(cl.id)->>'total_devido')::numeric, 2)       AS v3
    FROM public.clientes cl
  ) t
  WHERE t.v2 IS DISTINCT FROM t.v3;
  IF v_div > 0 THEN
    RAISE EXCEPTION 'Total devido V2 x V3 divergente em % cliente(s). Rollback integral.', v_div;
  END IF;

  ------------------------------------------------------------------
  -- 9) Sanidade final dos registros gravados
  ------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.pagamentos
    WHERE origem = 'migracao_v2'
      AND (valor <= 0
           OR cancelado = true
           OR mercadinho_id IS NULL
           OR mes_referencia <> date_trunc('month', mes_referencia)::date)
  ) THEN
    RAISE EXCEPTION 'Registro invalido gravado na carga. Rollback integral.';
  END IF;

  SELECT count(*), coalesce(round(sum(valor),2),0) INTO v_existentes, v_total
  FROM public.pagamentos WHERE origem = 'migracao_v2' AND cancelado = false;

  IF v_existentes <> v_esperados THEN
    RAISE EXCEPTION 'Quantidade migrada (%) difere da previa (%). Rollback integral.', v_existentes, v_esperados;
  END IF;

  -- Duplicidade (mesmo cliente + mes)
  IF EXISTS (
    SELECT 1 FROM public.pagamentos
    WHERE origem = 'migracao_v2' AND cancelado = false
    GROUP BY cliente_id, mes_referencia HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicidade detectada na carga. Rollback integral.';
  END IF;

  RAISE NOTICE 'CARGA OK | inseridos: % | ignorados: % | total migracao_v2: % | valor total: %',
    v_inseridos, v_ignorados, v_existentes, v_total;
END $$;

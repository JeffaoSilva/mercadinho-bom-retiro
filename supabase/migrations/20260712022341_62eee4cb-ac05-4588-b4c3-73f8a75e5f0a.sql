
-- 1) Correções na tabela pagamentos
UPDATE public.pagamentos p
SET mercadinho_id = (SELECT c.mercadinho_id FROM public.clientes c WHERE c.id = p.cliente_id)
WHERE p.mercadinho_id IS NULL;

ALTER TABLE public.pagamentos ALTER COLUMN mercadinho_id SET NOT NULL;

ALTER TABLE public.pagamentos
  ADD CONSTRAINT pagamentos_mes_referencia_primeiro_dia_chk
  CHECK (mes_referencia = date_trunc('month', mes_referencia)::date);

-- 2) RPC cliente_caderneta_v3
CREATE OR REPLACE FUNCTION public.cliente_caderneta_v3(p_cliente_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meses jsonb;
  v_total_devido numeric := 0;
BEGIN
  WITH compras_base AS (
    SELECT
      c.id,
      c.data_compra,
      c.valor_total,
      c.forma_pagamento,
      to_char(c.data_compra AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes
    FROM public.compras c
    WHERE c.cliente_id = p_cliente_id
      AND c.eh_visitante = false
      AND c.forma_pagamento = 'caderneta'
  ),
  pagamentos_base AS (
    SELECT
      pg.id,
      pg.criado_em,
      pg.valor,
      pg.forma_pagamento,
      pg.forma_pagamento_outro,
      pg.observacao,
      pg.origem,
      pg.cancelado,
      to_char(pg.mes_referencia, 'YYYY-MM') AS mes
    FROM public.pagamentos pg
    WHERE pg.cliente_id = p_cliente_id
  ),
  meses_unicos AS (
    SELECT mes FROM compras_base
    UNION
    SELECT mes FROM pagamentos_base
  ),
  compras_mes AS (
    SELECT
      cb.mes,
      COALESCE(SUM(cb.valor_total), 0) AS total_compras,
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'compra_id', cb.id,
          'data_compra', cb.data_compra,
          'data_compra_brasil', to_char(cb.data_compra AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
          'hora_compra_brasil', to_char(cb.data_compra AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
          'valor_total', cb.valor_total,
          'itens', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'item_id', i.id,
                'produto_id', i.produto_id,
                'produto', p.nome,
                'quantidade', i.quantidade,
                'valor_unitario', i.valor_unitario,
                'valor_total', i.valor_total
              ) ORDER BY p.nome
            )
            FROM public.itens_compra i
            LEFT JOIN public.produtos p ON p.id = i.produto_id
            WHERE i.compra_id = cb.id
          ), '[]'::jsonb)
        ) ORDER BY cb.data_compra ASC, cb.id ASC
      ), '[]'::jsonb) AS compras
    FROM compras_base cb
    GROUP BY cb.mes
  ),
  pagamentos_mes AS (
    SELECT
      pb.mes,
      COALESCE(SUM(pb.valor) FILTER (WHERE pb.cancelado = false), 0) AS total_pagamentos,
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'pagamento_id', pb.id,
          'data_pagamento', pb.criado_em,
          'data_pagamento_brasil', to_char(pb.criado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
          'hora_pagamento_brasil', to_char(pb.criado_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
          'valor', pb.valor,
          'forma_pagamento', pb.forma_pagamento,
          'forma_pagamento_outro', pb.forma_pagamento_outro,
          'observacao', pb.observacao,
          'origem', pb.origem,
          'cancelado', pb.cancelado
        ) ORDER BY pb.criado_em ASC, pb.id ASC
      ), '[]'::jsonb) AS pagamentos
    FROM pagamentos_base pb
    GROUP BY pb.mes
  ),
  combinado AS (
    SELECT
      mu.mes,
      COALESCE(cm.total_compras, 0) AS total_compras,
      COALESCE(pm.total_pagamentos, 0) AS total_pagamentos,
      GREATEST(COALESCE(cm.total_compras, 0) - COALESCE(pm.total_pagamentos, 0), 0) AS divida_mes,
      COALESCE(cm.compras, '[]'::jsonb) AS compras,
      COALESCE(pm.pagamentos, '[]'::jsonb) AS pagamentos
    FROM meses_unicos mu
    LEFT JOIN compras_mes cm ON cm.mes = mu.mes
    LEFT JOIN pagamentos_mes pm ON pm.mes = mu.mes
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'mes', c.mes,
        'total_compras', c.total_compras,
        'total_pagamentos', c.total_pagamentos,
        'divida_mes', c.divida_mes,
        'status',
          CASE
            WHEN c.total_pagamentos = 0 THEN 'em_aberto'
            WHEN c.divida_mes = 0 THEN 'quitado'
            ELSE 'parcial'
          END,
        'compras', c.compras,
        'pagamentos', c.pagamentos
      ) ORDER BY c.mes ASC
    ), '[]'::jsonb),
    COALESCE(SUM(c.divida_mes), 0)
  INTO v_meses, v_total_devido
  FROM combinado c;

  RETURN jsonb_build_object(
    'cliente_id', p_cliente_id,
    'total_devido', v_total_devido,
    'meses', v_meses
  );
END;
$$;

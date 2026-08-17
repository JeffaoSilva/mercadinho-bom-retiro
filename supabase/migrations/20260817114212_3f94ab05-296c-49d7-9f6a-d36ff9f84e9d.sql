CREATE OR REPLACE FUNCTION public.cliente_historico_mensal(p_cliente_id bigint, p_mes date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      c.id,
      c.data_compra,
      c.forma_pagamento,
      c.valor_total,
      COALESCE((SELECT SUM(e.valor_estornado) FROM public.estornos e WHERE e.compra_id = c.id), 0) AS estornado
    FROM public.compras c
    WHERE c.cliente_id = p_cliente_id
      AND c.eh_visitante = false
      AND date_trunc('month', (c.data_compra AT TIME ZONE 'America/Sao_Paulo'))
          = date_trunc('month', p_mes::timestamp)
  ),
  compras AS (
    SELECT
      b.*,
      GREATEST(b.valor_total - b.estornado, 0) AS liquido,
      CASE
        WHEN b.estornado <= 0 THEN 'normal'
        WHEN (b.valor_total - b.estornado) <= 0 THEN 'estornado'
        ELSE 'parcial'
      END AS status_estorno
    FROM base b
  )
  SELECT jsonb_build_object(
    'cliente_id', p_cliente_id,
    'mes', to_char(p_mes, 'YYYY-MM'),
    'total_compras', COALESCE((SELECT SUM(liquido) FROM compras), 0),
    'total_bruto', COALESCE((SELECT SUM(valor_total) FROM compras), 0),
    'total_estornado', COALESCE((SELECT SUM(estornado) FROM compras), 0),
    'quantidade_compras', (SELECT count(*) FROM compras),
    'por_forma_pagamento', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('forma_pagamento', f.forma_pagamento, 'total', f.total, 'quantidade', f.qtd) ORDER BY f.forma_pagamento)
      FROM (
        SELECT forma_pagamento, SUM(liquido) AS total, count(*) AS qtd
        FROM compras GROUP BY forma_pagamento
      ) f
    ), '[]'::jsonb),
    'compras', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'compra_id', c.id,
          'data_compra', c.data_compra,
          'data', to_char(c.data_compra AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
          'hora', to_char(c.data_compra AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
          'forma_pagamento', c.forma_pagamento,
          'valor_total_original', c.valor_total,
          'valor_estornado', c.estornado,
          'valor_liquido', c.liquido,
          'status_estorno', c.status_estorno,
          'itens', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'item_id', i.id,
                'produto_id', i.produto_id,
                'produto', COALESCE(p.nome, 'Produto'),
                'quantidade', i.quantidade,
                'quantidade_estornada', ie.qtd_est,
                'quantidade_liquida', GREATEST(i.quantidade - ie.qtd_est, 0),
                'valor_unitario', i.valor_unitario,
                'subtotal_original', i.valor_total,
                'valor_estornado', ie.val_est,
                'subtotal_liquido', GREATEST(i.valor_total - ie.val_est, 0)
              ) ORDER BY COALESCE(p.nome, 'Produto')
            )
            FROM public.itens_compra i
            LEFT JOIN public.produtos p ON p.id = i.produto_id
            CROSS JOIN LATERAL (
              SELECT
                COALESCE(SUM(e.quantidade), 0) AS qtd_est,
                COALESCE(SUM(e.valor_estornado), 0) AS val_est
              FROM public.estornos e
              WHERE e.item_compra_id = i.id
            ) ie
            WHERE i.compra_id = c.id
          ), '[]'::jsonb)
        ) ORDER BY c.data_compra DESC, c.id DESC
      )
      FROM compras c
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.cliente_historico_mensal(bigint, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cliente_historico_mensal(bigint, date) TO anon, authenticated, service_role;
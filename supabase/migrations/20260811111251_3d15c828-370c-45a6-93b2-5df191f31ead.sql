CREATE OR REPLACE FUNCTION public.admin_listar_clientes_debitos_v3()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH compras_base AS (
    SELECT
      c.cliente_id,
      to_char(c.data_compra AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
      SUM(c.valor_total) AS total_compras
    FROM public.compras c
    WHERE c.cliente_id IS NOT NULL
      AND c.eh_visitante = false
      AND c.forma_pagamento = 'caderneta'
    GROUP BY 1, 2
  ),
  pagamentos_base AS (
    SELECT
      pg.cliente_id,
      to_char(pg.mes_referencia, 'YYYY-MM') AS mes,
      SUM(pg.valor) FILTER (WHERE pg.cancelado = false) AS total_pagamentos
    FROM public.pagamentos pg
    GROUP BY 1, 2
  ),
  combinado AS (
    SELECT
      COALESCE(cb.cliente_id, pb.cliente_id) AS cliente_id,
      COALESCE(cb.total_compras, 0) AS total_compras,
      COALESCE(pb.total_pagamentos, 0) AS total_pagamentos,
      GREATEST(COALESCE(cb.total_compras, 0) - COALESCE(pb.total_pagamentos, 0), 0) AS divida_mes
    FROM compras_base cb
    FULL OUTER JOIN pagamentos_base pb
      ON pb.cliente_id = cb.cliente_id AND pb.mes = cb.mes
  ),
  por_cliente AS (
    SELECT
      cliente_id,
      SUM(total_compras) AS total_compras_caderneta,
      SUM(total_pagamentos) AS total_pagamentos_v3,
      SUM(divida_mes) AS total_devido_v3
    FROM combinado
    GROUP BY cliente_id
  ),
  pix AS (
    SELECT c.cliente_id, SUM(c.valor_total) AS total_pix
    FROM public.compras c
    WHERE c.cliente_id IS NOT NULL
      AND c.eh_visitante = false
      AND c.forma_pagamento = 'pix'
      AND c.paga = false
    GROUP BY c.cliente_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'cliente_id', cl.id,
      'nome', cl.nome,
      'mercadinho_id', cl.mercadinho_id,
      'total_compras_caderneta', COALESCE(pc.total_compras_caderneta, 0),
      'total_pagamentos_v3', COALESCE(pc.total_pagamentos_v3, 0),
      'total_devido_v3', COALESCE(pc.total_devido_v3, 0),
      'total_compras_pix', COALESCE(px.total_pix, 0)
    ) ORDER BY cl.nome
  ), '[]'::jsonb)
  FROM public.clientes cl
  LEFT JOIN por_cliente pc ON pc.cliente_id = cl.id
  LEFT JOIN pix px ON px.cliente_id = cl.id
  WHERE cl.ativo = true;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_listar_clientes_debitos_v3() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_listar_clientes_debitos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mes_atual text;
  v_mes_anterior text;
  v_result jsonb;
BEGIN
  v_mes_atual := to_char(now(), 'YYYY-MM');
  v_mes_anterior := to_char(now() - interval '1 month', 'YYYY-MM');
  
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'cliente_id', cl.id,
      'cliente_nome', cl.nome,
      'total_mes_atual', COALESCE((
        SELECT SUM(c.valor_total)
        FROM public.compras c
        WHERE c.cliente_id = cl.id
          AND c.mes_referencia = v_mes_atual
          AND c.paga = false
          AND c.forma_pagamento <> 'pix'
      ), 0),
      'total_mes_anterior', COALESCE((
        SELECT SUM(c.valor_total)
        FROM public.compras c
        WHERE c.cliente_id = cl.id
          AND c.mes_referencia = v_mes_anterior
          AND c.paga = false
          AND c.forma_pagamento <> 'pix'
      ), 0),
      'total_atrasado', COALESCE((
        SELECT SUM(c.valor_total)
        FROM public.compras c
        WHERE c.cliente_id = cl.id
          AND c.mes_referencia < v_mes_anterior
          AND c.paga = false
          AND c.forma_pagamento <> 'pix'
      ), 0),
      'total_pix', COALESCE((
        SELECT SUM(c.valor_total)
        FROM public.compras c
        WHERE c.cliente_id = cl.id
          AND c.paga = false
          AND c.forma_pagamento = 'pix'
      ), 0)
    )
  ), '[]'::jsonb) INTO v_result
  FROM public.clientes cl
  WHERE cl.ativo = true;
  
  RETURN jsonb_build_object(
    'mes_atual', v_mes_atual,
    'mes_anterior', v_mes_anterior,
    'clientes', v_result
  );
END;
$function$;

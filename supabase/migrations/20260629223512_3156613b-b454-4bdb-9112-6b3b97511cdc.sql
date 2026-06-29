CREATE OR REPLACE FUNCTION public.cliente_historico_completo(p_cliente_id bigint, p_limit int DEFAULT 20, p_offset int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_jsonb(t) ORDER BY t.criado_em DESC, t.compra_id DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      c.id AS compra_id,
      c.criado_em,
      c.data_compra,
      to_char(c.data_compra AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS data_compra_brasil,
      to_char(c.data_compra AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS hora_compra_brasil,
      c.mercadinho_id,
      c.forma_pagamento,
      c.valor_total,
      c.mes_referencia,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'produto_id', i.produto_id,
          'nome', p.nome,
          'quantidade', i.quantidade,
          'valor_unitario', i.valor_unitario,
          'valor_total', i.valor_total
        ) ORDER BY p.nome)
        FROM public.itens_compra i
        LEFT JOIN public.produtos p ON p.id = i.produto_id
        WHERE i.compra_id = c.id
      ), '[]'::jsonb) AS itens
    FROM public.compras c
    WHERE c.cliente_id = p_cliente_id
      AND c.eh_visitante = false
    ORDER BY c.criado_em DESC, c.id DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cliente_historico_completo(bigint, int, int) TO anon, authenticated, service_role;
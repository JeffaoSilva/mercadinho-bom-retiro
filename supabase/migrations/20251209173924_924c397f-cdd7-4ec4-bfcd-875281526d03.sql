-- 1) Adicionar coluna data_limite (DATE) em config_pagamentos_mensais
ALTER TABLE public.config_pagamentos_mensais
ADD COLUMN IF NOT EXISTS data_limite date;

-- 2) Atualizar RPC cliente_historico para retornar data_limite ao invés de dia_limite
DROP FUNCTION IF EXISTS public.cliente_historico(bigint);

CREATE OR REPLACE FUNCTION public.cliente_historico(p_cliente_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mes_atual text;
  v_mes_anterior text;
  v_data_limite date;
  v_compras_mes_atual jsonb;
  v_compras_mes_anterior jsonb;
  v_compras_atrasadas jsonb;
BEGIN
  v_mes_atual := to_char(now(), 'YYYY-MM');
  v_mes_anterior := to_char(now() - interval '1 month', 'YYYY-MM');

  -- Busca data_limite definida por você para o mês anterior.
  SELECT data_limite
  INTO v_data_limite
  FROM public.config_pagamentos_mensais
  WHERE mes_referencia = v_mes_anterior;

  -- Compras do mês atual (não pagas)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'compra_id', c.id,
      'criado_em', c.criado_em,
      'mercadinho_id', c.mercadinho_id,
      'forma_pagamento', c.forma_pagamento,
      'valor_total', c.valor_total,
      'mes_referencia', c.mes_referencia,
      'itens', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'produto_id', i.produto_id,
            'nome', p.nome,
            'quantidade', i.quantidade,
            'valor_unitario', i.valor_unitario,
            'valor_total', i.valor_total
          ) ORDER BY p.nome
        ), '[]'::jsonb)
        FROM public.itens_compra i
        JOIN public.produtos p ON p.id = i.produto_id
        WHERE i.compra_id = c.id
      )
    ) ORDER BY c.criado_em DESC
  ), '[]'::jsonb) INTO v_compras_mes_atual
  FROM public.compras c
  WHERE c.cliente_id = p_cliente_id
    AND c.mes_referencia = v_mes_atual
    AND c.paga = false;

  -- Compras do mês anterior (não pagas)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'compra_id', c.id,
      'criado_em', c.criado_em,
      'mercadinho_id', c.mercadinho_id,
      'forma_pagamento', c.forma_pagamento,
      'valor_total', c.valor_total,
      'mes_referencia', c.mes_referencia,
      'itens', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'produto_id', i.produto_id,
            'nome', p.nome,
            'quantidade', i.quantidade,
            'valor_unitario', i.valor_unitario,
            'valor_total', i.valor_total
          ) ORDER BY p.nome
        ), '[]'::jsonb)
        FROM public.itens_compra i
        JOIN public.produtos p ON p.id = i.produto_id
        WHERE i.compra_id = c.id
      )
    ) ORDER BY c.criado_em DESC
  ), '[]'::jsonb) INTO v_compras_mes_anterior
  FROM public.compras c
  WHERE c.cliente_id = p_cliente_id
    AND c.mes_referencia = v_mes_anterior
    AND c.paga = false;

  -- Compras atrasadas (antes do mês anterior, não pagas)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'compra_id', c.id,
      'criado_em', c.criado_em,
      'mercadinho_id', c.mercadinho_id,
      'forma_pagamento', c.forma_pagamento,
      'valor_total', c.valor_total,
      'mes_referencia', c.mes_referencia,
      'itens', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'produto_id', i.produto_id,
            'nome', p.nome,
            'quantidade', i.quantidade,
            'valor_unitario', i.valor_unitario,
            'valor_total', i.valor_total
          ) ORDER BY p.nome
        ), '[]'::jsonb)
        FROM public.itens_compra i
        JOIN public.produtos p ON p.id = i.produto_id
        WHERE i.compra_id = c.id
      )
    ) ORDER BY c.criado_em DESC
  ), '[]'::jsonb) INTO v_compras_atrasadas
  FROM public.compras c
  WHERE c.cliente_id = p_cliente_id
    AND c.mes_referencia < v_mes_anterior
    AND c.paga = false;

  RETURN jsonb_build_object(
    'mes_atual', v_mes_atual,
    'mes_anterior', v_mes_anterior,
    'data_limite', v_data_limite,   -- pode vir NULL se você não configurar
    'compras_mes_atual', v_compras_mes_atual,
    'compras_mes_anterior', v_compras_mes_anterior,
    'compras_atrasadas', v_compras_atrasadas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cliente_historico(bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.cliente_historico(bigint) TO authenticated;
-- Dropar função existente para poder recriar com novo tipo de retorno
DROP FUNCTION IF EXISTS public.cliente_historico(bigint);

-- Recriar RPC cliente_historico retornando JSONB estruturado
CREATE OR REPLACE FUNCTION public.cliente_historico(p_cliente_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes_atual text;
  v_mes_anterior text;
  v_dia_limite integer;
  v_compras_mes_atual jsonb;
  v_compras_mes_anterior jsonb;
  v_compras_atrasadas jsonb;
BEGIN
  -- Calcular meses
  v_mes_atual := to_char(now(), 'YYYY-MM');
  v_mes_anterior := to_char(now() - interval '1 month', 'YYYY-MM');
  
  -- Buscar dia_limite: primeiro tenta config específica do mês anterior, depois padrão
  SELECT dia_limite INTO v_dia_limite
  FROM public.config_pagamentos_mensais
  WHERE mes_referencia = v_mes_anterior;
  
  IF v_dia_limite IS NULL THEN
    SELECT dia_limite_padrao INTO v_dia_limite
    FROM public.config_sistema
    WHERE id = 1;
  END IF;
  
  IF v_dia_limite IS NULL THEN
    v_dia_limite := 5; -- fallback
  END IF;
  
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
  
  -- Compras atrasadas (meses anteriores ao mês anterior, não pagas)
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
    'dia_limite', v_dia_limite,
    'compras_mes_atual', v_compras_mes_atual,
    'compras_mes_anterior', v_compras_mes_anterior,
    'compras_atrasadas', v_compras_atrasadas
  );
END;
$function$;

-- Grant execute para anon e authenticated
GRANT EXECUTE ON FUNCTION public.cliente_historico(bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.cliente_historico(bigint) TO authenticated;

-- Criar RPC para admin listar clientes com débitos
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
      ), 0),
      'total_mes_anterior', COALESCE((
        SELECT SUM(c.valor_total)
        FROM public.compras c
        WHERE c.cliente_id = cl.id
          AND c.mes_referencia = v_mes_anterior
          AND c.paga = false
      ), 0),
      'total_atrasado', COALESCE((
        SELECT SUM(c.valor_total)
        FROM public.compras c
        WHERE c.cliente_id = cl.id
          AND c.mes_referencia < v_mes_anterior
          AND c.paga = false
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

GRANT EXECUTE ON FUNCTION public.admin_listar_clientes_debitos() TO authenticated;

-- RPC para marcar compras como pagas por mes_referencia
CREATE OR REPLACE FUNCTION public.admin_marcar_pago_mes(
  p_cliente_id bigint,
  p_mes_referencia text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.compras
  SET paga = true, paga_em = now()
  WHERE cliente_id = p_cliente_id
    AND mes_referencia = p_mes_referencia
    AND paga = false;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN jsonb_build_object('ok', true, 'compras_marcadas', v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_marcar_pago_mes(bigint, text) TO authenticated;

-- RPC para marcar todas as compras atrasadas como pagas
CREATE OR REPLACE FUNCTION public.admin_marcar_atrasadas_pagas(p_cliente_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes_anterior text;
  v_count integer;
BEGIN
  v_mes_anterior := to_char(now() - interval '1 month', 'YYYY-MM');
  
  UPDATE public.compras
  SET paga = true, paga_em = now()
  WHERE cliente_id = p_cliente_id
    AND mes_referencia < v_mes_anterior
    AND paga = false;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN jsonb_build_object('ok', true, 'compras_marcadas', v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_marcar_atrasadas_pagas(bigint) TO authenticated;

-- RPC para estornar item com opção de devolver ao estoque
CREATE OR REPLACE FUNCTION public.admin_estornar_item(
  p_item_compra_id bigint,
  p_devolver_estoque boolean,
  p_prateleira_id bigint DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item record;
  v_compra record;
  v_novo_total numeric;
BEGIN
  -- Buscar item
  SELECT * INTO v_item FROM public.itens_compra WHERE id = p_item_compra_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Item não encontrado');
  END IF;
  
  -- Buscar compra
  SELECT * INTO v_compra FROM public.compras WHERE id = v_item.compra_id;
  
  -- Registrar estorno
  INSERT INTO public.estornos (
    compra_id, item_compra_id, produto_id, quantidade, 
    valor_estornado, devolveu_estoque, prateleira_id, motivo
  ) VALUES (
    v_item.compra_id, p_item_compra_id, v_item.produto_id, v_item.quantidade,
    v_item.valor_total, p_devolver_estoque, p_prateleira_id, p_motivo
  );
  
  -- Se devolver ao estoque
  IF p_devolver_estoque THEN
    IF p_prateleira_id IS NOT NULL THEN
      -- Devolver para prateleira específica
      UPDATE public.prateleiras_produtos
      SET quantidade_prateleira = quantidade_prateleira + v_item.quantidade,
          atualizado_em = now()
      WHERE id = p_prateleira_id;
    ELSE
      -- Devolver para estoque geral do produto
      UPDATE public.produtos
      SET quantidade_atual = quantidade_atual + v_item.quantidade
      WHERE id = v_item.produto_id;
    END IF;
  END IF;
  
  -- Deletar item
  DELETE FROM public.itens_compra WHERE id = p_item_compra_id;
  
  -- Recalcular total da compra
  SELECT COALESCE(SUM(valor_total), 0) INTO v_novo_total
  FROM public.itens_compra
  WHERE compra_id = v_item.compra_id;
  
  IF v_novo_total <= 0 THEN
    -- Se não sobrar itens, deletar a compra
    DELETE FROM public.compras WHERE id = v_item.compra_id;
    RETURN jsonb_build_object('ok', true, 'compra_removida', true);
  ELSE
    UPDATE public.compras
    SET valor_total = v_novo_total
    WHERE id = v_item.compra_id;
    RETURN jsonb_build_object('ok', true, 'novo_total', v_novo_total);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_estornar_item(bigint, boolean, bigint, text) TO authenticated;
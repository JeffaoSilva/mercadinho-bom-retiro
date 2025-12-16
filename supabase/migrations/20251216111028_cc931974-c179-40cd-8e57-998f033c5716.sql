-- PASSO 1: Adicionar colunas em itens_compra
ALTER TABLE public.itens_compra
  ADD COLUMN IF NOT EXISTS prateleira_id bigint,
  ADD COLUMN IF NOT EXISTS lote_id bigint;

-- Criar FK para prateleira_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'itens_compra_prateleira_id_fkey'
  ) THEN
    ALTER TABLE public.itens_compra
      ADD CONSTRAINT itens_compra_prateleira_id_fkey
      FOREIGN KEY (prateleira_id)
      REFERENCES public.prateleiras_produtos(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_itens_compra_compra_id ON public.itens_compra(compra_id);
CREATE INDEX IF NOT EXISTS idx_itens_compra_prateleira_id ON public.itens_compra(prateleira_id);

-- PASSO 2: Atualizar criar_compra_kiosk para gravar prateleira_id e lote_id
CREATE OR REPLACE FUNCTION public.criar_compra_kiosk(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_compra_id bigint;
  v_item jsonb;
  v_prateleira_id bigint;
  v_lote_id bigint;
BEGIN
  -- 1) Inserir compra
  INSERT INTO public.compras (
    cliente_id,
    mercadinho_id,
    tablet_id,
    forma_pagamento,
    eh_visitante,
    valor_total,
    paga
  )
  VALUES (
    (payload->>'cliente_id')::bigint,
    (payload->>'mercadinho_id')::bigint,
    (payload->>'tablet_id')::bigint,
    payload->>'forma_pagamento',
    COALESCE((payload->>'eh_visitante')::boolean, false),
    (payload->>'valor_total')::numeric,
    false
  )
  RETURNING id INTO v_compra_id;

  -- 2) Inserir itens + 3) Baixar estoque da prateleira
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'itens')
  LOOP
    -- Extrair prateleira_id e lote_id do item
    v_prateleira_id := NULLIF(v_item->>'prateleira_id','')::bigint;
    v_lote_id := NULLIF(v_item->>'lote_id','')::bigint;

    INSERT INTO public.itens_compra (
      compra_id,
      produto_id,
      quantidade,
      valor_unitario,
      valor_total,
      prateleira_id,
      lote_id
    )
    VALUES (
      v_compra_id,
      (v_item->>'produto_id')::bigint,
      (v_item->>'quantidade')::int,
      (v_item->>'valor_unitario')::numeric,
      (v_item->>'valor_total')::numeric,
      v_prateleira_id,
      v_lote_id
    );

    -- Baixar quantidade da prateleira específica (se informada)
    IF v_prateleira_id IS NOT NULL THEN
      UPDATE public.prateleiras_produtos
      SET quantidade_prateleira = quantidade_prateleira - (v_item->>'quantidade')::int,
          atualizado_em = now()
      WHERE id = v_prateleira_id
        AND quantidade_prateleira >= (v_item->>'quantidade')::int;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);
END;
$function$;

-- PASSO 3: Corrigir admin_estornar_item para usar origem automática
CREATE OR REPLACE FUNCTION public.admin_estornar_item(p_item_compra_id bigint, p_devolver_estoque boolean, p_prateleira_id bigint DEFAULT NULL::bigint, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item record;
  v_compra record;
  v_novo_total numeric;
  v_prateleira_destino bigint;
BEGIN
  -- Buscar item
  SELECT * INTO v_item FROM public.itens_compra WHERE id = p_item_compra_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Item não encontrado');
  END IF;
  
  -- Buscar compra
  SELECT * INTO v_compra FROM public.compras WHERE id = v_item.compra_id;
  
  -- Determinar prateleira de destino:
  -- 1) Se p_prateleira_id foi passado, usar ele (manual tem prioridade)
  -- 2) Senão, usar itens_compra.prateleira_id (origem automática)
  -- 3) Senão, será NULL (devolve ao estoque central)
  v_prateleira_destino := COALESCE(p_prateleira_id, v_item.prateleira_id);
  
  -- Registrar estorno com a prateleira efetivamente utilizada
  INSERT INTO public.estornos (
    compra_id, item_compra_id, produto_id, quantidade, 
    valor_estornado, devolveu_estoque, prateleira_id, motivo
  ) VALUES (
    v_item.compra_id, p_item_compra_id, v_item.produto_id, v_item.quantidade,
    v_item.valor_total, p_devolver_estoque, v_prateleira_destino, p_motivo
  );
  
  -- Se devolver ao estoque
  IF p_devolver_estoque THEN
    IF v_prateleira_destino IS NOT NULL THEN
      -- Devolver para prateleira (manual ou origem automática)
      UPDATE public.prateleiras_produtos
      SET quantidade_prateleira = quantidade_prateleira + v_item.quantidade,
          atualizado_em = now()
      WHERE id = v_prateleira_destino;
    ELSE
      -- Devolver para estoque geral do produto (fallback)
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

-- PASSO 4: Nova RPC admin_estornar_compra
CREATE OR REPLACE FUNCTION public.admin_estornar_compra(p_compra_id bigint, p_devolver_estoque boolean, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item_ids bigint[];
  v_item_id bigint;
  v_count int := 0;
  v_result jsonb;
BEGIN
  -- Verificar se a compra existe
  IF NOT EXISTS (SELECT 1 FROM public.compras WHERE id = p_compra_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Compra não encontrada');
  END IF;
  
  -- Capturar lista de itens ANTES de alterar
  SELECT array_agg(id) INTO v_item_ids
  FROM public.itens_compra
  WHERE compra_id = p_compra_id;
  
  -- Se não houver itens
  IF v_item_ids IS NULL OR array_length(v_item_ids, 1) IS NULL THEN
    -- Deletar compra vazia
    DELETE FROM public.compras WHERE id = p_compra_id;
    RETURN jsonb_build_object('ok', true, 'itens_estornados', 0, 'compra_removida', true);
  END IF;
  
  -- Para cada item, chamar admin_estornar_item com prateleira NULL (usa origem automática)
  FOREACH v_item_id IN ARRAY v_item_ids
  LOOP
    v_result := public.admin_estornar_item(v_item_id, p_devolver_estoque, NULL, p_motivo);
    IF (v_result->>'ok')::boolean THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'ok', true,
    'itens_estornados', v_count,
    'compra_removida', true
  );
END;
$function$;
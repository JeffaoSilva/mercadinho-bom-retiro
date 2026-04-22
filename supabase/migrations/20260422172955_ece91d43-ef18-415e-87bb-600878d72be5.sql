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
  v_qtd_solicitada int;
  v_qtd_disponivel int;
  v_produto_id bigint;
  v_produto_nome text;
  v_rows_updated int;
BEGIN
  -- 1) VALIDAÇÃO PRÉVIA: percorre todos os itens e verifica estoque na prateleira
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'itens')
  LOOP
    v_prateleira_id := NULLIF(v_item->>'prateleira_id','')::bigint;
    v_qtd_solicitada := (v_item->>'quantidade')::int;
    v_produto_id := (v_item->>'produto_id')::bigint;

    IF v_prateleira_id IS NOT NULL THEN
      SELECT quantidade_prateleira INTO v_qtd_disponivel
      FROM public.prateleiras_produtos
      WHERE id = v_prateleira_id;

      IF v_qtd_disponivel IS NULL OR v_qtd_disponivel < v_qtd_solicitada THEN
        SELECT nome INTO v_produto_nome FROM public.produtos WHERE id = v_produto_id;
        RETURN jsonb_build_object(
          'ok', false,
          'erro', 'Estoque insuficiente',
          'produto_id', v_produto_id,
          'produto_nome', COALESCE(v_produto_nome, 'Produto')
        );
      END IF;
    END IF;
  END LOOP;

  -- 2) Inserir compra
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

  -- 3) Inserir itens + baixar estoque com guarda (quantidade_prateleira >= solicitada)
  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'itens')
  LOOP
    v_prateleira_id := NULLIF(v_item->>'prateleira_id','')::bigint;
    v_lote_id := NULLIF(v_item->>'lote_id','')::bigint;
    v_qtd_solicitada := (v_item->>'quantidade')::int;
    v_produto_id := (v_item->>'produto_id')::bigint;

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
      v_produto_id,
      v_qtd_solicitada,
      (v_item->>'valor_unitario')::numeric,
      (v_item->>'valor_total')::numeric,
      v_prateleira_id,
      v_lote_id
    );

    IF v_prateleira_id IS NOT NULL THEN
      UPDATE public.prateleiras_produtos
      SET quantidade_prateleira = quantidade_prateleira - v_qtd_solicitada,
          atualizado_em = now()
      WHERE id = v_prateleira_id
        AND quantidade_prateleira >= v_qtd_solicitada;

      GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

      IF v_rows_updated = 0 THEN
        -- Race condition: estoque mudou entre validação e update
        SELECT nome INTO v_produto_nome FROM public.produtos WHERE id = v_produto_id;
        RAISE EXCEPTION 'ESTOQUE_INSUFICIENTE:%:%', v_produto_id, COALESCE(v_produto_nome, 'Produto');
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'compra_id', v_compra_id);

EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'ESTOQUE_INSUFICIENTE:%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'erro', 'Estoque insuficiente',
        'produto_id', (string_to_array(SQLERRM, ':'))[2]::bigint,
        'produto_nome', (string_to_array(SQLERRM, ':'))[3]
      );
    END IF;
    RAISE;
END;
$function$;
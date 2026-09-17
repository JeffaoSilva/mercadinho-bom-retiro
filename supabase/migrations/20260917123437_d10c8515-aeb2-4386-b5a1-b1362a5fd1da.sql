ALTER TABLE public.reservas_checkout_pagbank
  ADD COLUMN IF NOT EXISTS compra_id bigint REFERENCES public.compras(id);

CREATE UNIQUE INDEX IF NOT EXISTS reservas_checkout_pagbank_compra_id_uniq
  ON public.reservas_checkout_pagbank (compra_id)
  WHERE compra_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finalizar_venda_pix_pagbank(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_val              jsonb;
  v_num              numeric;
  v_order_id         text;
  v_status_pagbank   text;
  v_valor_centavos   bigint;
  v_cob              public.reservas_checkout_pagbank%ROWTYPE;
  v_res              public.reservas_checkout%ROWTYPE;
  v_it               record;
  v_qtd_itens        integer := 0;
  v_soma_itens       numeric := 0;
  v_compra_id        bigint;
  v_qtd_prat         integer;
  v_reservado_outras integer;
  v_rows             integer;
  v_prat_mercadinho  bigint;
  v_prat_produto     bigint;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;

  v_val := payload -> 'pagbank_order_id';
  IF v_val IS NULL OR jsonb_typeof(v_val) <> 'string' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;
  v_order_id := v_val #>> '{}';
  IF length(btrim(v_order_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;

  v_val := payload -> 'status_pagbank';
  IF v_val IS NULL OR jsonb_typeof(v_val) <> 'string' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;
  v_status_pagbank := upper(btrim(v_val #>> '{}'));

  v_val := payload -> 'valor_centavos';
  IF v_val IS NULL OR jsonb_typeof(v_val) <> 'number' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;
  v_num := CAST(v_val AS numeric);
  IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 9223372036854775807 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;
  v_valor_centavos := v_num::bigint;

  -- 1) Localizar e bloquear a cobrança
  SELECT c.* INTO v_cob
  FROM public.reservas_checkout_pagbank c
  WHERE c.pagbank_order_id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PEDIDO_NAO_ENCONTRADO', 'erro', 'Pedido não encontrado');
  END IF;

  -- 2) Idempotência
  IF v_cob.compra_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'reutilizada', true, 'status', v_cob.status,
      'compra_id', v_cob.compra_id, 'reserva_id', v_cob.reserva_id);
  END IF;

  -- 3) Status
  IF v_status_pagbank <> 'PAID' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PAGAMENTO_NAO_CONFIRMADO', 'erro', 'Pagamento não confirmado');
  END IF;

  -- 4) Valor
  IF v_valor_centavos IS DISTINCT FROM v_cob.valor_centavos THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'VALOR_DIVERGENTE', 'erro', 'Valor divergente');
  END IF;

  -- 5) Reserva
  SELECT r.* INTO v_res
  FROM public.reservas_checkout r
  WHERE r.id = v_cob.reserva_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'RESERVA_NAO_ENCONTRADA', 'erro', 'Reserva não encontrada');
  END IF;

  IF v_res.forma_pagamento <> 'pix' OR v_res.cliente_id IS NULL OR v_res.mercadinho_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'RESERVA_INVALIDA', 'erro', 'Reserva inválida');
  END IF;

  IF v_res.cancelada_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'RESERVA_CANCELADA', 'erro', 'Reserva cancelada');
  END IF;

  IF v_res.confirmada_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'RESERVA_JA_CONFIRMADA', 'erro', 'Reserva já confirmada');
  END IF;

  -- 6) Itens / consistência financeira
  SELECT count(*), COALESCE(sum(ri.valor_total), 0)
    INTO v_qtd_itens, v_soma_itens
  FROM public.reservas_checkout_itens ri
  WHERE ri.reserva_id = v_res.id;

  IF v_qtd_itens = 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'RESERVA_SEM_ITENS', 'erro', 'Reserva sem itens');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservas_checkout_itens ri
    WHERE ri.reserva_id = v_res.id
      AND (ri.quantidade <= 0
        OR ri.valor_unitario <= 0
        OR ri.valor_total <> ri.valor_unitario * ri.quantidade)
  )
  OR v_soma_itens <> v_res.valor_total
  OR round(v_res.valor_total * 100)::bigint <> v_cob.valor_centavos THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'INCONSISTENCIA_FINANCEIRA_RESERVA', 'erro', 'Inconsistência financeira');
  END IF;

  -- 7) Compra
  INSERT INTO public.compras (
    cliente_id, mercadinho_id, tablet_id, forma_pagamento, tipo_pagamento,
    eh_visitante, valor_total, paga, paga_em
  ) VALUES (
    v_res.cliente_id, v_res.mercadinho_id, v_res.tablet_id, 'pix', 'pix',
    false, v_res.valor_total, true, now()
  ) RETURNING id INTO v_compra_id;

  -- 8) Itens + baixa de estoque (ordem determinística por prateleira_id)
  FOR v_it IN
    SELECT ri.id, ri.prateleira_id, ri.quantidade, ri.valor_unitario, ri.valor_total
    FROM public.reservas_checkout_itens ri
    WHERE ri.reserva_id = v_res.id
    ORDER BY ri.prateleira_id ASC, ri.id ASC
  LOOP
    SELECT pp.quantidade_prateleira, pp.mercadinho_id, pp.produto_id
      INTO v_qtd_prat, v_prat_mercadinho, v_prat_produto
    FROM public.prateleiras_produtos pp
    WHERE pp.id = v_it.prateleira_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FIN_PIX:PRATELEIRA_NAO_ENCONTRADA' USING ERRCODE = 'P0001';
    END IF;

    IF v_prat_mercadinho IS DISTINCT FROM v_res.mercadinho_id THEN
      RAISE EXCEPTION 'FIN_PIX:MERCADINHO_INCOERENTE' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(sum(ri2.quantidade), 0)
      INTO v_reservado_outras
    FROM public.reservas_checkout_itens ri2
    JOIN public.reservas_checkout r2 ON r2.id = ri2.reserva_id
    WHERE ri2.prateleira_id = v_it.prateleira_id
      AND r2.id <> v_res.id
      AND r2.confirmada_em IS NULL
      AND r2.cancelada_em IS NULL
      AND r2.expira_em > now();

    IF (v_qtd_prat - v_reservado_outras) < v_it.quantidade THEN
      RAISE EXCEPTION 'FIN_PIX:ESTOQUE_INSUFICIENTE_FINALIZACAO' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.itens_compra (
      compra_id, produto_id, quantidade, valor_unitario, valor_total, prateleira_id
    ) VALUES (
      v_compra_id, v_prat_produto, v_it.quantidade, v_it.valor_unitario, v_it.valor_total, v_it.prateleira_id
    );

    UPDATE public.prateleiras_produtos
       SET quantidade_prateleira = quantidade_prateleira - v_it.quantidade,
           atualizado_em = now()
     WHERE id = v_it.prateleira_id
       AND quantidade_prateleira >= v_it.quantidade;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'FIN_PIX:ESTOQUE_INSUFICIENTE_FINALIZACAO' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- 9) Confirmar reserva
  UPDATE public.reservas_checkout
     SET confirmada_em = now()
   WHERE id = v_res.id;

  -- 10) Marcar cobrança
  UPDATE public.reservas_checkout_pagbank
     SET status = 'PAGA',
         pagbank_status = 'PAID',
         compra_id = v_compra_id,
         erro_mensagem = NULL
   WHERE id = v_cob.id;

  RETURN jsonb_build_object(
    'ok', true, 'reutilizada', false, 'status', 'PAGA',
    'compra_id', v_compra_id, 'reserva_id', v_res.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.finalizar_venda_pix_pagbank(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_venda_pix_pagbank(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.finalizar_venda_pix_pagbank(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_pix_pagbank(jsonb) TO service_role;
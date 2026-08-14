CREATE OR REPLACE FUNCTION public.criar_reserva_checkout_pix(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_agora             timestamptz;
  v_chave             uuid;
  v_chave_txt         text;
  v_itens             jsonb;
  v_item              jsonb;
  v_val               jsonb;
  v_num               numeric;
  v_mercadinho_id     bigint;
  v_cliente_id        bigint;
  v_tablet_id         bigint;
  v_prateleira_id     bigint;
  v_quantidade        integer;
  v_calc              jsonb := '[]'::jsonb;
  v_itens_out         jsonb := '[]'::jsonb;
  v_preco_base        numeric;
  v_desconto          numeric;
  v_preco_unit        numeric;
  v_valor_total_item  numeric;
  v_qtd_prateleira    integer;
  v_reservado         integer;
  v_disponivel        integer;
  v_total             numeric := 0;
  v_reserva_id        bigint;
  v_produto_id        bigint;
  v_pp_mercadinho_id  bigint;
  v_pp_ativo          boolean;
  v_r                 public.reservas_checkout%ROWTYPE;
  v_divergente        boolean;
BEGIN
  v_agora := pg_catalog.statement_timestamp();

  IF payload IS NULL OR pg_catalog.jsonb_typeof(payload) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;

  v_val := payload -> 'chave_idempotencia';
  IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) <> 'string' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;
  v_chave_txt := v_val #>> '{}';
  BEGIN
    v_chave := v_chave_txt::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END;

  v_val := payload -> 'mercadinho_id';
  IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) <> 'number' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;
  v_num := CAST(v_val AS numeric);
  IF v_num <> pg_catalog.trunc(v_num)
     OR v_num < -9223372036854775808
     OR v_num >  9223372036854775807 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;
  v_mercadinho_id := v_num::bigint;

  v_val := payload -> 'cliente_id';
  IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) = 'null' THEN
    v_cliente_id := NULL;
  ELSE
    IF pg_catalog.jsonb_typeof(v_val) <> 'number' THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
    END IF;
    v_num := CAST(v_val AS numeric);
    IF v_num <> pg_catalog.trunc(v_num)
       OR v_num < -9223372036854775808
       OR v_num >  9223372036854775807 THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
    END IF;
    v_cliente_id := v_num::bigint;
  END IF;

  v_val := payload -> 'tablet_id';
  IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) = 'null' THEN
    v_tablet_id := NULL;
  ELSE
    IF pg_catalog.jsonb_typeof(v_val) <> 'number' THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
    END IF;
    v_num := CAST(v_val AS numeric);
    IF v_num <> pg_catalog.trunc(v_num)
       OR v_num < -9223372036854775808
       OR v_num >  9223372036854775807 THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
    END IF;
    v_tablet_id := v_num::bigint;
  END IF;

  v_itens := payload -> 'itens';
  IF v_itens IS NULL
     OR pg_catalog.jsonb_typeof(v_itens) <> 'array'
     OR pg_catalog.jsonb_array_length(v_itens) = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
  END IF;

  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_itens) LOOP
    IF pg_catalog.jsonb_typeof(v_item) <> 'object' THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
    END IF;

    v_val := v_item -> 'prateleira_id';
    IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) <> 'number' THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
    END IF;
    v_num := CAST(v_val AS numeric);
    IF v_num <> pg_catalog.trunc(v_num)
       OR v_num < -9223372036854775808
       OR v_num >  9223372036854775807 THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PAYLOAD_INVALIDO', 'erro', 'Payload inválido');
    END IF;
    v_prateleira_id := v_num::bigint;

    v_val := v_item -> 'quantidade';
    IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) <> 'number' THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'QUANTIDADE_INVALIDA', 'erro', 'Quantidade inválida');
    END IF;
    v_num := CAST(v_val AS numeric);
    IF v_num <> pg_catalog.trunc(v_num)
       OR v_num < 1
       OR v_num > 2147483647 THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'QUANTIDADE_INVALIDA', 'erro', 'Quantidade inválida');
    END IF;
    v_quantidade := v_num::integer;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(v_calc) c
      WHERE (c.value ->> 'prateleira_id')::bigint = v_prateleira_id
    ) THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'ITEM_DUPLICADO', 'erro', 'Item duplicado',
        'prateleira_id', v_prateleira_id);
    END IF;

    v_calc := v_calc || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'prateleira_id', v_prateleira_id,
        'quantidade', v_quantidade
      )
    );
  END LOOP;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reserva_checkout_pix:' || v_chave::text, 0)
  );

  SELECT r.* INTO v_r
  FROM public.reservas_checkout r
  WHERE r.chave_idempotencia = v_chave;

  IF FOUND THEN
    IF v_r.mercadinho_id IS DISTINCT FROM v_mercadinho_id
       OR v_r.cliente_id IS DISTINCT FROM v_cliente_id
       OR v_r.tablet_id  IS DISTINCT FROM v_tablet_id THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'IDEMPOTENCIA_CONFLITO', 'erro', 'Conflito de idempotência');
    END IF;

    SELECT EXISTS (
      SELECT p.prateleira_id, p.quantidade
      FROM (
        SELECT (c.value ->> 'prateleira_id')::bigint AS prateleira_id,
               (c.value ->> 'quantidade')::integer   AS quantidade
        FROM pg_catalog.jsonb_array_elements(v_calc) c
      ) p
      EXCEPT ALL
      SELECT ri.prateleira_id, ri.quantidade
      FROM public.reservas_checkout_itens ri
      WHERE ri.reserva_id = v_r.id
    )
    OR EXISTS (
      SELECT ri.prateleira_id, ri.quantidade
      FROM public.reservas_checkout_itens ri
      WHERE ri.reserva_id = v_r.id
      EXCEPT ALL
      SELECT p.prateleira_id, p.quantidade
      FROM (
        SELECT (c.value ->> 'prateleira_id')::bigint AS prateleira_id,
               (c.value ->> 'quantidade')::integer   AS quantidade
        FROM pg_catalog.jsonb_array_elements(v_calc) c
      ) p
    )
    INTO v_divergente;

    IF v_divergente THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'IDEMPOTENCIA_CONFLITO', 'erro', 'Conflito de idempotência');
    END IF;

    IF v_r.confirmada_em IS NOT NULL
       OR v_r.cancelada_em IS NOT NULL
       OR v_r.expira_em <= v_agora THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'IDEMPOTENCIA_ENCERRADA', 'erro', 'Reserva encerrada');
    END IF;

    SELECT COALESCE(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'prateleira_id', ri.prateleira_id,
                 'quantidade', ri.quantidade,
                 'valor_unitario', ri.valor_unitario,
                 'valor_total', ri.valor_total
               ) ORDER BY ri.prateleira_id ASC
             ), '[]'::jsonb)
      INTO v_itens_out
    FROM public.reservas_checkout_itens ri
    WHERE ri.reserva_id = v_r.id;

    RETURN pg_catalog.jsonb_build_object(
      'ok', true,
      'reserva_id', v_r.id,
      'chave_idempotencia', v_r.chave_idempotencia,
      'valor_total', v_r.valor_total,
      'expira_em', v_r.expira_em,
      'reutilizada', true,
      'itens', v_itens_out
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.mercadinhos m WHERE m.id = v_mercadinho_id) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'codigo', 'MERCADINHO_INVALIDO', 'erro', 'Mercadinho inválido');
  END IF;

  IF v_cliente_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = v_cliente_id) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'codigo', 'CLIENTE_INVALIDO', 'erro', 'Cliente inválido');
  END IF;

  IF v_tablet_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tablets t WHERE t.id = v_tablet_id) THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'codigo', 'TABLET_INVALIDO', 'erro', 'Tablet inválido');
  END IF;

  FOR v_prateleira_id, v_quantidade IN
    SELECT (c.value ->> 'prateleira_id')::bigint,
           (c.value ->> 'quantidade')::integer
    FROM pg_catalog.jsonb_array_elements(v_calc) c
    ORDER BY (c.value ->> 'prateleira_id')::bigint ASC
  LOOP
    SELECT pp.produto_id, pp.mercadinho_id, pp.ativo,
           pp.preco_venda_prateleira, pp.quantidade_prateleira
      INTO v_produto_id, v_pp_mercadinho_id, v_pp_ativo,
           v_preco_base, v_qtd_prateleira
    FROM public.prateleiras_produtos pp
    WHERE pp.id = v_prateleira_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PRATELEIRA_INVALIDA', 'erro', 'Prateleira inválida',
        'prateleira_id', v_prateleira_id);
    END IF;

    IF v_pp_ativo IS NOT TRUE THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PRATELEIRA_INATIVA', 'erro', 'Prateleira inativa',
        'prateleira_id', v_prateleira_id);
    END IF;

    IF v_pp_mercadinho_id IS DISTINCT FROM v_mercadinho_id THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PRATELEIRA_OUTRO_MERCADINHO',
        'erro', 'Prateleira de outro mercadinho',
        'prateleira_id', v_prateleira_id);
    END IF;

    IF v_preco_base IS NULL
       OR v_preco_base <= 0
       OR v_preco_base <> pg_catalog.round(v_preco_base, 2) THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PRECO_INVALIDO', 'erro', 'Preço inválido',
        'prateleira_id', v_prateleira_id);
    END IF;

    v_desconto := NULL;

    SELECT pr.desconto_percentual
      INTO v_desconto
    FROM public.promocoes pr
    WHERE pr.ativa IS TRUE
      AND pr.tipo = 'produto'
      AND pr.produto_id = v_produto_id
      AND pr.inicia_em <= v_agora
      AND (pr.termina_em IS NULL OR pr.termina_em >= v_agora)
    ORDER BY pr.desconto_percentual DESC, pr.id ASC
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT pr.desconto_percentual
        INTO v_desconto
      FROM public.promocoes pr
      WHERE pr.ativa IS TRUE
        AND pr.tipo = 'global'
        AND pr.inicia_em <= v_agora
        AND (pr.termina_em IS NULL OR pr.termina_em >= v_agora)
      ORDER BY pr.desconto_percentual DESC, pr.id ASC
      LIMIT 1;

      IF NOT FOUND THEN
        v_desconto := NULL;
      END IF;
    END IF;

    IF v_desconto IS NOT NULL THEN
      IF v_desconto < 0 OR v_desconto > 100 THEN
        RETURN pg_catalog.jsonb_build_object(
          'ok', false, 'codigo', 'PROMOCAO_INVALIDA', 'erro', 'Promoção inválida',
          'prateleira_id', v_prateleira_id);
      END IF;
      v_preco_unit := pg_catalog.round(v_preco_base * (1 - v_desconto / 100), 2);
    ELSE
      v_preco_unit := v_preco_base;
    END IF;

    IF v_preco_unit <= 0 THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'PRECO_INVALIDO', 'erro', 'Preço inválido',
        'prateleira_id', v_prateleira_id);
    END IF;

    SELECT COALESCE(pg_catalog.SUM(ri.quantidade), 0)
      INTO v_reservado
    FROM public.reservas_checkout_itens ri
    JOIN public.reservas_checkout r ON r.id = ri.reserva_id
    WHERE ri.prateleira_id = v_prateleira_id
      AND r.confirmada_em IS NULL
      AND r.cancelada_em IS NULL
      AND r.expira_em > v_agora;

    v_disponivel := v_qtd_prateleira - v_reservado;

    IF v_disponivel < v_quantidade THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false, 'codigo', 'ESTOQUE_INSUFICIENTE', 'erro', 'Estoque insuficiente',
        'prateleira_id', v_prateleira_id,
        'disponivel', v_disponivel);
    END IF;

    v_valor_total_item := v_preco_unit * v_quantidade;
    v_total := v_total + v_valor_total_item;

    v_itens_out := v_itens_out || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'prateleira_id', v_prateleira_id,
        'quantidade', v_quantidade,
        'valor_unitario', v_preco_unit,
        'valor_total', v_valor_total_item
      )
    );
  END LOOP;

  SELECT COALESCE(pg_catalog.SUM((i.value ->> 'valor_total')::numeric), 0)
    INTO v_total
  FROM pg_catalog.jsonb_array_elements(v_itens_out) i;

  IF v_total IS NULL OR v_total <= 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false, 'codigo', 'TOTAL_INVALIDO', 'erro', 'Total inválido');
  END IF;

  INSERT INTO public.reservas_checkout
    (mercadinho_id, cliente_id, tablet_id, forma_pagamento,
     valor_total, chave_idempotencia, criado_em, expira_em)
  VALUES
    (v_mercadinho_id, v_cliente_id, v_tablet_id, 'pix',
     v_total, v_chave, v_agora, v_agora + interval '3 minutes')
  RETURNING id INTO v_reserva_id;

  INSERT INTO public.reservas_checkout_itens
    (reserva_id, prateleira_id, quantidade, valor_unitario, valor_total, criado_em)
  SELECT v_reserva_id,
         (i.value ->> 'prateleira_id')::bigint,
         (i.value ->> 'quantidade')::integer,
         (i.value ->> 'valor_unitario')::numeric,
         (i.value ->> 'valor_total')::numeric,
         v_agora
  FROM pg_catalog.jsonb_array_elements(v_itens_out) i;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'reserva_id', v_reserva_id,
    'chave_idempotencia', v_chave,
    'valor_total', v_total,
    'expira_em', v_agora + interval '3 minutes',
    'reutilizada', false,
    'itens', v_itens_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.criar_reserva_checkout_pix(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_reserva_checkout_pix(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.criar_reserva_checkout_pix(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.criar_reserva_checkout_pix(jsonb) TO service_role;
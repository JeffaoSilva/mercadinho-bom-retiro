-- =====================================================================
-- RPC transacional: criação de reserva de checkout PIX
-- NÃO EXECUTADA AINDA (aguardando autorização)
-- Alteração desta revisão: validação numérica passa a depender
-- exclusivamente do VALOR numeric, sem regex e sem forma textual.
-- =====================================================================

CREATE FUNCTION public.criar_reserva_checkout_pix(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_agora            timestamptz;
  v_chave            uuid;
  v_itens            jsonb;
  v_item             jsonb;
  v_val              jsonb;
  v_num              numeric;
  v_mercadinho_id    bigint;
  v_cliente_id       bigint;
  v_tablet_id        bigint;
  v_prateleira_id    bigint;
  v_quantidade       integer;
  v_calc             jsonb := '[]'::jsonb;
  v_preco_base       numeric;
  v_desconto         numeric;
  v_preco_unit       numeric;
  v_qtd_prateleira   integer;
  v_reservado        integer;
  v_disponivel       integer;
  v_total            numeric := 0;
  v_reserva_id       bigint;
  v_reserva_existente bigint;
  v_divergente       boolean;
  v_produto_id       bigint;
BEGIN
  v_agora := pg_catalog.statement_timestamp();

  ---------------------------------------------------------------------
  -- 1. Validação estrutural do payload
  ---------------------------------------------------------------------
  IF payload IS NULL OR pg_catalog.jsonb_typeof(payload) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
  END IF;

  -- chave_idempotencia (uuid em string)
  v_val := payload -> 'chave_idempotencia';
  IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) <> 'string' THEN
    RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
  END IF;
  BEGIN
    v_chave := (v_val #>> '{}')::uuid;
  EXCEPTION WHEN others THEN
    RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
  END;

  -- mercadinho_id (obrigatório, bigint)
  v_val := payload -> 'mercadinho_id';
  IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) <> 'number' THEN
    RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
  END IF;
  v_num := CAST(v_val AS numeric);
  IF v_num <> pg_catalog.trunc(v_num)
     OR v_num < -9223372036854775808
     OR v_num >  9223372036854775807 THEN
    RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
  END IF;
  v_mercadinho_id := v_num::bigint;

  -- cliente_id (opcional; NULL = visitante)
  v_val := payload -> 'cliente_id';
  IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) = 'null' THEN
    v_cliente_id := NULL;
  ELSE
    IF pg_catalog.jsonb_typeof(v_val) <> 'number' THEN
      RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
    END IF;
    v_num := CAST(v_val AS numeric);
    IF v_num <> pg_catalog.trunc(v_num)
       OR v_num < -9223372036854775808
       OR v_num >  9223372036854775807 THEN
      RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
    END IF;
    v_cliente_id := v_num::bigint;
  END IF;

  -- tablet_id (opcional)
  v_val := payload -> 'tablet_id';
  IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) = 'null' THEN
    v_tablet_id := NULL;
  ELSE
    IF pg_catalog.jsonb_typeof(v_val) <> 'number' THEN
      RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
    END IF;
    v_num := CAST(v_val AS numeric);
    IF v_num <> pg_catalog.trunc(v_num)
       OR v_num < -9223372036854775808
       OR v_num >  9223372036854775807 THEN
      RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
    END IF;
    v_tablet_id := v_num::bigint;
  END IF;

  -- itens
  v_itens := payload -> 'itens';
  IF v_itens IS NULL
     OR pg_catalog.jsonb_typeof(v_itens) <> 'array'
     OR pg_catalog.jsonb_array_length(v_itens) = 0 THEN
    RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
  END IF;

  ---------------------------------------------------------------------
  -- 2. Idempotência (lock transacional + reserva já existente)
  ---------------------------------------------------------------------
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_chave::text, 0)
  );

  SELECT r.id INTO v_reserva_existente
  FROM public.reservas_checkout r
  WHERE r.chave_idempotencia = v_chave;

  IF v_reserva_existente IS NOT NULL THEN
    -- comparação semântica do payload de itens com a reserva existente
    SELECT EXISTS (
      SELECT p.prateleira_id, p.quantidade
      FROM (
        SELECT (i.value ->> 'prateleira_id')::bigint AS prateleira_id,
               (i.value ->> 'quantidade')::integer   AS quantidade
        FROM pg_catalog.jsonb_array_elements(v_itens) AS i(value)
        WHERE pg_catalog.jsonb_typeof(i.value -> 'prateleira_id') = 'number'
          AND pg_catalog.jsonb_typeof(i.value -> 'quantidade')    = 'number'
      ) p
      EXCEPT ALL
      SELECT ri.prateleira_id, ri.quantidade
      FROM public.reservas_checkout_itens ri
      WHERE ri.reserva_id = v_reserva_existente
    ) INTO v_divergente;

    IF v_divergente THEN
      RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'IDEMPOTENCIA_DIVERGENTE');
    END IF;

    SELECT pg_catalog.jsonb_build_object(
             'sucesso', true,
             'reserva_id', r.id,
             'valor_total', r.valor_total,
             'expira_em', r.expira_em,
             'reaproveitada', true
           )
    INTO v_val
    FROM public.reservas_checkout r
    WHERE r.id = v_reserva_existente;

    RETURN v_val;
  END IF;

  ---------------------------------------------------------------------
  -- 3. Validação de existência (mercadinho, cliente, tablet)
  ---------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.mercadinhos m WHERE m.id = v_mercadinho_id) THEN
    RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'MERCADINHO_INVALIDO');
  END IF;

  IF v_cliente_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = v_cliente_id AND c.ativo IS TRUE) THEN
    RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'CLIENTE_INVALIDO');
  END IF;

  IF v_tablet_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tablets t WHERE t.id = v_tablet_id) THEN
    RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'TABLET_INVALIDO');
  END IF;

  ---------------------------------------------------------------------
  -- 4. Validação numérica dos itens (sem regex, sem forma textual)
  ---------------------------------------------------------------------
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_itens) LOOP
    IF pg_catalog.jsonb_typeof(v_item) <> 'object' THEN
      RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
    END IF;

    -- prateleira_id (bigint)
    v_val := v_item -> 'prateleira_id';
    IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) <> 'number' THEN
      RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
    END IF;
    v_num := CAST(v_val AS numeric);
    IF v_num <> pg_catalog.trunc(v_num)
       OR v_num < -9223372036854775808
       OR v_num >  9223372036854775807 THEN
      RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'PAYLOAD_INVALIDO');
    END IF;
    v_prateleira_id := v_num::bigint;

    -- quantidade (integer, 1..2147483647)
    v_val := v_item -> 'quantidade';
    IF v_val IS NULL OR pg_catalog.jsonb_typeof(v_val) <> 'number' THEN
      RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'QUANTIDADE_INVALIDA');
    END IF;
    v_num := CAST(v_val AS numeric);
    IF v_num <> pg_catalog.trunc(v_num)
       OR v_num < 1
       OR v_num > 2147483647 THEN
      RETURN pg_catalog.jsonb_build_object('sucesso', false, 'erro', 'QUANTIDADE_INVALIDA');
    END IF;
    v_quantidade := v_num::integer;

    -- agregação de itens repetidos da mesma prateleira
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_calc) c
      WHERE (c.value ->> 'prateleira_id')::bigint = v_prateleira_id
    ) THEN
      SELECT pg_catalog.jsonb_agg(
               CASE WHEN (c.value ->> 'prateleira_id')::bigint = v_prateleira_id
                    THEN pg_catalog.jsonb_set(
                           c.value, '{quantidade}',
                           pg_catalog.to_jsonb(((c.value ->> 'quantidade')::integer + v_quantidade))
                         )
                    ELSE c.value END)
      INTO v_calc
      FROM pg_catalog.jsonb_array_elements(v_calc) c;
    ELSE
      v_calc := v_calc || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'prateleira_id', v_prateleira_id,
          'quantidade', v_quantidade
        )
      );
    END IF;
  END LOOP;

  ---------------------------------------------------------------------
  -- 5. Locks das prateleiras em ordem determinística (id ASC),
  --    preço base, promoções, estoque disponível e total
  ---------------------------------------------------------------------
  FOR v_prateleira_id, v_quantidade IN
    SELECT (c.value ->> 'prateleira_id')::bigint,
           (c.value ->> 'quantidade')::integer
    FROM pg_catalog.jsonb_array_elements(v_calc) c
    ORDER BY (c.value ->> 'prateleira_id')::bigint ASC
  LOOP
    SELECT pp.produto_id, pp.preco_venda_prateleira, pp.quantidade_prateleira
      INTO v_produto_id, v_preco_base, v_qtd_prateleira
    FROM public.prateleiras_produtos pp
    WHERE pp.id = v_prateleira_id
      AND pp.mercadinho_id = v_mercadinho_id
      AND pp.ativo IS TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'sucesso', false, 'erro', 'PRATELEIRA_INVALIDA',
        'prateleira_id', v_prateleira_id);
    END IF;

    -- promoção: por produto tem prioridade; depois global.
    -- maior desconto vence; empate resolvido pelo menor id.
    SELECT pr.desconto_percentual
      INTO v_desconto
    FROM public.promocoes pr
    WHERE pr.ativa IS TRUE
      AND (pr.inicia_em IS NULL OR pr.inicia_em <= v_agora)
      AND (pr.termina_em IS NULL OR pr.termina_em >= v_agora)
      AND (pr.produto_id = v_produto_id OR pr.produto_id IS NULL)
    ORDER BY (pr.produto_id IS NOT NULL) DESC,
             pr.desconto_percentual DESC,
             pr.id ASC
    LIMIT 1;

    v_preco_unit := pg_catalog.round(
      v_preco_base * (1 - pg_catalog.COALESCE(v_desconto, 0) / 100), 2);

    -- estoque disponível = prateleira - reservas PIX ativas
    SELECT pg_catalog.COALESCE(pg_catalog.SUM(ri.quantidade), 0)
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
        'sucesso', false, 'erro', 'ESTOQUE_INSUFICIENTE',
        'prateleira_id', v_prateleira_id,
        'disponivel', v_disponivel);
    END IF;

    v_total := v_total + (v_preco_unit * v_quantidade);

    -- guarda preço calculado no acumulador
    SELECT pg_catalog.jsonb_agg(
             CASE WHEN (c.value ->> 'prateleira_id')::bigint = v_prateleira_id
                  THEN c.value
                       || pg_catalog.jsonb_build_object('valor_unitario', v_preco_unit)
                  ELSE c.value END)
    INTO v_calc
    FROM pg_catalog.jsonb_array_elements(v_calc) c;
  END LOOP;

  ---------------------------------------------------------------------
  -- 6. Criação atômica da reserva
  ---------------------------------------------------------------------
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
         (c.value ->> 'prateleira_id')::bigint,
         (c.value ->> 'quantidade')::integer,
         (c.value ->> 'valor_unitario')::numeric,
         (c.value ->> 'valor_unitario')::numeric * (c.value ->> 'quantidade')::integer,
         v_agora
  FROM pg_catalog.jsonb_array_elements(v_calc) c;

  RETURN pg_catalog.jsonb_build_object(
    'sucesso', true,
    'reserva_id', v_reserva_id,
    'valor_total', v_total,
    'expira_em', v_agora + interval '3 minutes',
    'reaproveitada', false
  );
END;
$$;

-- Permissões: nenhuma execução por PUBLIC/anon/authenticated
REVOKE ALL ON FUNCTION public.criar_reserva_checkout_pix(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_reserva_checkout_pix(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.criar_reserva_checkout_pix(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.criar_reserva_checkout_pix(jsonb) TO service_role;

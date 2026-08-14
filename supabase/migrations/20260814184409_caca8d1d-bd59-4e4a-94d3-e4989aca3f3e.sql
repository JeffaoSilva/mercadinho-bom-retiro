DROP TABLE IF EXISTS pg_temp._rep_testes_pix;
CREATE TEMP TABLE _rep_testes_pix(linha text);

DO $$
DECLARE
  rep text := '';
  r jsonb; r2 jsonb;
  k uuid; k2 uuid;
  P bigint := 232; M bigint := 2; M2 bigint := 1; PR bigint := 164;
  base jsonb;
  q_ini integer; q_dep integer; q_apos_a integer; preco numeric;
  reservado_atual integer; disponivel_atual integer;
  v_agora_teste timestamptz;
  v_id bigint; v_id2 bigint; v_cnt integer; v_diff interval;
  res_antes integer; itens_antes integer; res_depois integer; itens_depois integer;
  t text; okf boolean; n_pass integer := 0; n_fail integer := 0;
  pf record;
  v_promo_id bigint; v_promo_tipo text; v_promo_desc numeric; v_preco_esperado numeric;
BEGIN
  v_agora_teste := pg_catalog.statement_timestamp();

  SELECT * INTO pf FROM public.prateleiras_produtos WHERE id = P;

  SELECT COALESCE(SUM(ri.quantidade),0) INTO reservado_atual
    FROM public.reservas_checkout_itens ri
    JOIN public.reservas_checkout rr ON rr.id = ri.reserva_id
   WHERE ri.prateleira_id = P
     AND rr.confirmada_em IS NULL
     AND rr.cancelada_em IS NULL
     AND rr.expira_em > v_agora_teste;

  disponivel_atual := COALESCE(pf.quantidade_prateleira,0) - COALESCE(reservado_atual,0);

  IF pf.id IS NULL
     OR pf.mercadinho_id IS DISTINCT FROM M
     OR pf.produto_id IS DISTINCT FROM PR
     OR pf.ativo IS NOT TRUE
     OR COALESCE(pf.quantidade_prateleira,0) <= 0
     OR disponivel_atual < 1
     OR pf.preco_venda_prateleira IS NULL
     OR pf.preco_venda_prateleira <= 0
     OR pf.preco_venda_prateleira <> round(pf.preco_venda_prateleira,2) THEN
    INSERT INTO _rep_testes_pix(linha) VALUES (
      'DADOS_TESTE_INVALIDOS: ' || COALESCE(to_jsonb(pf)::text,'prateleira inexistente')
      || ' | fisico=' || COALESCE(pf.quantidade_prateleira::text,'NULL')
      || ' reservado=' || COALESCE(reservado_atual::text,'NULL')
      || ' disponivel=' || COALESCE(disponivel_atual::text,'NULL'));
    RETURN;
  END IF;

  q_ini := pf.quantidade_prateleira;
  preco := pf.preco_venda_prateleira;
  SELECT count(*) INTO res_antes FROM public.reservas_checkout;
  SELECT count(*) INTO itens_antes FROM public.reservas_checkout_itens;
  rep := rep || format('PREFLIGHT OK: prateleira=%s mercadinho=%s produto=%s ativo=%s fisico=%s reservado=%s disponivel=%s preco=%s',
                       pf.id, pf.mercadinho_id, pf.produto_id, pf.ativo, q_ini, reservado_atual, disponivel_atual, preco);
  rep := rep || format(E'\nANTES: reservas=%s itens=%s estoque=%s', res_antes, itens_antes, q_ini);

  k := gen_random_uuid();
  k2 := gen_random_uuid();

  BEGIN
    base := jsonb_build_object('mercadinho_id', M, 'cliente_id', NULL, 'tablet_id', NULL,
              'itens', jsonb_build_array(jsonb_build_object('prateleira_id', P, 'quantidade', 1)));

    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia','not-a-uuid'));
    okf := (r->>'codigo') = 'PAYLOAD_INVALIDO';
    rep := rep || E'\n1a uuid_invalido | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', gen_random_uuid()::text, 'mercadinho_id','2'));
    okf := (r->>'codigo') = 'PAYLOAD_INVALIDO';
    rep := rep || E'\n1b mercadinho_string | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', gen_random_uuid()::text) || '{"mercadinho_id":1.5}'::jsonb);
    okf := (r->>'codigo') = 'PAYLOAD_INVALIDO';
    rep := rep || E'\n1c mercadinho_1.5 | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', gen_random_uuid()::text) || '{"mercadinho_id":9223372036854775808}'::jsonb);
    okf := (r->>'codigo') = 'PAYLOAD_INVALIDO';
    rep := rep || E'\n1d mercadinho_overflow | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    FOR t IN SELECT unnest(ARRAY['0','-1','1.5','2147483648']) LOOP
      r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', gen_random_uuid()::text,
             'itens', ('[{"prateleira_id":' || P || ',"quantidade":' || t || '}]')::jsonb));
      okf := (r->>'codigo') = 'QUANTIDADE_INVALIDA';
      rep := rep || E'\n1 qtd=' || t || ' | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
      IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;
    END LOOP;

    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', gen_random_uuid()::text,
           'itens', jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1),
                                      jsonb_build_object('prateleira_id',P,'quantidade',2))));
    okf := (r->>'codigo') = 'ITEM_DUPLICADO';
    rep := rep || E'\n1i duplicado | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    -- 2. reserva valida
    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', k::text,
           'itens', jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    v_id := (r ->> 'reserva_id')::bigint;
    SELECT expira_em - criado_em INTO v_diff FROM public.reservas_checkout WHERE id = v_id;
    SELECT quantidade_prateleira INTO q_apos_a FROM public.prateleiras_produtos WHERE id = P;
    okf := (r->>'ok')::boolean IS TRUE
           AND (r->>'reutilizada')::boolean IS FALSE
           AND v_id IS NOT NULL
           AND (r->>'chave_idempotencia')::uuid = k
           AND (r->>'valor_total')::numeric > 0
           AND (r->'itens') IS NOT NULL
           AND jsonb_array_length(r->'itens') = 1
           AND v_diff = interval '3 minutes'
           AND q_apos_a = q_ini;
    rep := rep || E'\n2 reserva_valida | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text
                || ' | janela=' || COALESCE(v_diff::text,'NULL') || ' estoque=' || q_ini || '->' || q_apos_a;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    -- 3. idempotencia retry
    r2 := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', k::text,
           'itens', jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    v_id2 := (r2 ->> 'reserva_id')::bigint;
    SELECT count(*) INTO v_cnt FROM public.reservas_checkout WHERE chave_idempotencia = k;
    okf := (r2->>'ok')::boolean IS TRUE AND (r2->>'reutilizada')::boolean IS TRUE
           AND v_id2 = v_id AND v_cnt = 1;
    rep := rep || E'\n3 retry_idempotente | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r2::text
                || ' | linhas_chave=' || v_cnt;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', k::text,
           'itens', jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',2))));
    okf := (r->>'codigo') = 'IDEMPOTENCIA_CONFLITO';
    rep := rep || E'\n3b qtd_diferente | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    -- 4. conflitos de cabecalho
    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', k::text, 'cliente_id', 1,
           'itens', jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    okf := (r->>'codigo') = 'IDEMPOTENCIA_CONFLITO';
    rep := rep || E'\n4a cliente_diferente | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', k::text, 'tablet_id', 1,
           'itens', jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    okf := (r->>'codigo') = 'IDEMPOTENCIA_CONFLITO';
    rep := rep || E'\n4b tablet_diferente | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', k::text, 'mercadinho_id', M2,
           'itens', jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    okf := (r->>'codigo') = 'IDEMPOTENCIA_CONFLITO';
    rep := rep || E'\n4c mercadinho_diferente | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    -- 5. reserva encerrada
    UPDATE public.reservas_checkout SET cancelada_em = now() WHERE id = v_id;
    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', k::text,
           'itens', jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    okf := (r->>'codigo') = 'IDEMPOTENCIA_ENCERRADA';
    rep := rep || E'\n5 encerrada_cancelada | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END || ' | ' || r::text;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;
    UPDATE public.reservas_checkout SET cancelada_em = NULL WHERE id = v_id;

    -- 6. estoque reservado bloqueia
    r := public.criar_reserva_checkout_pix(base || jsonb_build_object('chave_idempotencia', k2::text,
           'itens', jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade', q_ini))));
    SELECT quantidade_prateleira INTO q_dep FROM public.prateleiras_produtos WHERE id = P;
    okf := (r->>'codigo') = 'ESTOQUE_INSUFICIENTE' AND q_dep = q_ini;
    rep := rep || E'\n6 reserva_B_qtd=' || q_ini || ' | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END
                || ' | ' || r::text || ' | estoque=' || q_dep;
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    -- 7. preco e total
    v_promo_id := NULL; v_promo_tipo := NULL; v_promo_desc := NULL;
    SELECT pr.id, pr.tipo, pr.desconto_percentual
      INTO v_promo_id, v_promo_tipo, v_promo_desc
      FROM public.promocoes pr
     WHERE pr.ativa IS TRUE AND pr.tipo = 'produto' AND pr.produto_id = PR
       AND pr.inicia_em <= v_agora_teste AND (pr.termina_em IS NULL OR pr.termina_em >= v_agora_teste)
     ORDER BY pr.desconto_percentual DESC, pr.id ASC LIMIT 1;
    IF v_promo_id IS NULL THEN
      SELECT pr.id, pr.tipo, pr.desconto_percentual
        INTO v_promo_id, v_promo_tipo, v_promo_desc
        FROM public.promocoes pr
       WHERE pr.ativa IS TRUE AND pr.tipo = 'global'
         AND pr.inicia_em <= v_agora_teste AND (pr.termina_em IS NULL OR pr.termina_em >= v_agora_teste)
       ORDER BY pr.desconto_percentual DESC, pr.id ASC LIMIT 1;
    END IF;
    IF v_promo_id IS NULL THEN
      v_preco_esperado := preco;
    ELSE
      v_preco_esperado := round(preco * (1 - v_promo_desc / 100), 2);
    END IF;

    okf := EXISTS (
      SELECT 1 FROM public.reservas_checkout_itens ri
       JOIN public.reservas_checkout rr ON rr.id = ri.reserva_id
      WHERE ri.reserva_id = v_id
        AND ri.valor_unitario = v_preco_esperado
        AND ri.valor_total = ri.valor_unitario * ri.quantidade
        AND rr.valor_total = (SELECT SUM(valor_total) FROM public.reservas_checkout_itens WHERE reserva_id = v_id));
    rep := rep || E'\n7 preco_total | ' || CASE WHEN okf THEN 'PASSOU' ELSE 'FALHOU' END
                || ' | preco_base=' || preco
                || ' promo_id=' || COALESCE(v_promo_id::text,'NULL')
                || ' promo_tipo=' || COALESCE(v_promo_tipo,'NULL')
                || ' promo_desc=' || COALESCE(v_promo_desc::text,'NULL')
                || ' preco_esperado=' || v_preco_esperado
                || ' itens='
                || COALESCE((SELECT jsonb_agg(jsonb_build_object('q',quantidade,'vu',valor_unitario,'vt',valor_total))::text
                      FROM public.reservas_checkout_itens WHERE reserva_id = v_id),'NULL')
                || ' total_reserva=' || COALESCE((SELECT valor_total::text FROM public.reservas_checkout WHERE id = v_id),'NULL');
    IF okf THEN n_pass := n_pass+1; ELSE n_fail := n_fail+1; END IF;

    RAISE EXCEPTION 'FIM_TESTES';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'FIM_TESTES' THEN
      rep := rep || E'\nERRO_INESPERADO sqlstate=' || SQLSTATE || ' msg=' || SQLERRM;
      n_fail := n_fail + 1;
    ELSE
      rep := rep || E'\nSUBTRANSACAO_REVERTIDA=OK';
    END IF;
  END;

  SELECT count(*) INTO res_depois FROM public.reservas_checkout;
  SELECT count(*) INTO itens_depois FROM public.reservas_checkout_itens;
  SELECT quantidade_prateleira INTO q_dep FROM public.prateleiras_produtos WHERE id = P;
  rep := rep || format(E'\nDEPOIS: reservas=%s itens=%s estoque=%s', res_depois, itens_depois, q_dep);
  SELECT count(*) INTO v_cnt FROM public.reservas_checkout WHERE chave_idempotencia IN (k, k2);
  rep := rep || E'\nCHAVES_TESTE_RESTANTES=' || v_cnt;
  SELECT count(*) INTO v_cnt FROM public.reservas_checkout_itens ri
    JOIN public.reservas_checkout rr ON rr.id = ri.reserva_id
   WHERE rr.chave_idempotencia IN (k, k2);
  rep := rep || E'\nITENS_TESTE_RESTANTES=' || v_cnt;
  rep := rep || format(E'\nTOTAIS: PASSOU=%s FALHOU=%s', n_pass, n_fail);
  rep := rep || E'\nCHAVES_USADAS k=' || k::text || ' k2=' || k2::text;

  INSERT INTO _rep_testes_pix(linha) VALUES (rep);
  RAISE NOTICE E'RELATORIO\n%', rep;
END $$;

SELECT linha FROM _rep_testes_pix;
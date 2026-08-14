DROP TABLE IF EXISTS pg_temp._rep_testes_pix;
CREATE TEMP TABLE _rep_testes_pix(ord int, linha text);

DO $do$
DECLARE
  rep text := '';
  n int := 0;
  P bigint := 232; M bigint := 2; M2 bigint := 1; PR bigint := 164;
  v_agora_teste timestamptz;
  v_existe boolean;
  v_ativo boolean; v_merc bigint; v_prod bigint; v_qtd int; v_preco numeric;
  v_reservado int; v_disp int;
  res_antes bigint; itens_antes bigint; est_antes int;
  res_depois bigint; itens_depois bigint; est_depois int;
  chaves_rest bigint; itens_rest bigint;
  k uuid := gen_random_uuid(); k2 uuid := gen_random_uuid();
  cli bigint; tab bigint;
  j jsonb; j2 jsonb;
  rid bigint;
  cnt bigint;
  crd timestamptz; exp timestamptz;
  vu numeric; vt numeric; vtot numeric;
  v_promo_id bigint; v_promo_tipo text; v_promo_desc numeric; v_preco_esperado numeric;
  erro_inesperado text := '';
  preflight_ok boolean;
BEGIN
  v_agora_teste := pg_catalog.statement_timestamp();

  SELECT true, pp.ativo, pp.mercadinho_id, pp.produto_id, pp.quantidade_prateleira, pp.preco_venda_prateleira
    INTO v_existe, v_ativo, v_merc, v_prod, v_qtd, v_preco
  FROM public.prateleiras_produtos pp WHERE pp.id = P;

  SELECT COALESCE(SUM(ri.quantidade),0) INTO v_reservado
  FROM public.reservas_checkout_itens ri
  JOIN public.reservas_checkout r ON r.id = ri.reserva_id
  WHERE ri.prateleira_id = P AND r.confirmada_em IS NULL AND r.cancelada_em IS NULL
    AND r.expira_em > v_agora_teste;
  v_disp := COALESCE(v_qtd,0) - v_reservado;

  SELECT count(*) INTO res_antes FROM public.reservas_checkout;
  SELECT count(*) INTO itens_antes FROM public.reservas_checkout_itens;
  est_antes := v_qtd;

  SELECT c.id INTO cli FROM public.clientes c ORDER BY c.id LIMIT 1;
  SELECT t.id INTO tab FROM public.tablets t ORDER BY t.id LIMIT 1;

  rep := rep || format('PREFLIGHT | prateleira=%s existe=%s ativo=%s mercadinho=%s produto=%s | fisico=%s reservado=%s disponivel=%s preco_base=%s | cliente=%s tablet=%s | reservas_antes=%s itens_antes=%s',
    P, COALESCE(v_existe,false), v_ativo, v_merc, v_prod, v_qtd, v_reservado, v_disp, v_preco, cli, tab, res_antes, itens_antes) || E'\n';

  preflight_ok := COALESCE(v_existe,false)
    AND v_merc = M AND v_prod = PR AND v_ativo IS TRUE
    AND COALESCE(v_qtd,0) > 0 AND v_disp >= 1
    AND v_preco IS NOT NULL AND v_preco > 0 AND v_preco = round(v_preco,2)
    AND cli IS NOT NULL AND tab IS NOT NULL;

  IF NOT preflight_ok THEN
    rep := rep || format('DADOS_TESTE_INVALIDOS | existe=%s ativo=%s mercadinho=%s (esperado %s) produto=%s (esperado %s) fisico=%s disponivel=%s preco=%s cliente=%s tablet=%s | bateria encerrada sem chamar a RPC',
      COALESCE(v_existe,false), v_ativo, v_merc, M, v_prod, PR, v_qtd, v_disp, v_preco, cli, tab) || E'\n';
    FOR n IN 1..array_length(string_to_array(rtrim(rep,E'\n'),E'\n'),1) LOOP
      INSERT INTO _rep_testes_pix VALUES (n, (string_to_array(rtrim(rep,E'\n'),E'\n'))[n]);
    END LOOP;
    RAISE NOTICE '%', rep;
    RETURN;
  END IF;

  SELECT pr.id, pr.tipo, pr.desconto_percentual INTO v_promo_id, v_promo_tipo, v_promo_desc
  FROM public.promocoes pr
  WHERE pr.ativa IS TRUE AND pr.tipo='produto' AND pr.produto_id=v_prod
    AND pr.inicia_em <= v_agora_teste AND (pr.termina_em IS NULL OR pr.termina_em >= v_agora_teste)
  ORDER BY pr.desconto_percentual DESC, pr.id ASC LIMIT 1;
  IF v_promo_id IS NULL THEN
    SELECT pr.id, pr.tipo, pr.desconto_percentual INTO v_promo_id, v_promo_tipo, v_promo_desc
    FROM public.promocoes pr
    WHERE pr.ativa IS TRUE AND pr.tipo='global'
      AND pr.inicia_em <= v_agora_teste AND (pr.termina_em IS NULL OR pr.termina_em >= v_agora_teste)
    ORDER BY pr.desconto_percentual DESC, pr.id ASC LIMIT 1;
  END IF;
  IF v_promo_id IS NULL THEN
    v_preco_esperado := v_preco;
  ELSE
    v_preco_esperado := round(v_preco * (1 - v_promo_desc/100), 2);
  END IF;
  rep := rep || format('PROMOCAO | id=%s tipo=%s desconto=%s | preco_esperado=%s', v_promo_id, v_promo_tipo, v_promo_desc, v_preco_esperado) || E'\n';

  BEGIN
    j := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia','nao-uuid','mercadinho_id',M,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    rep := rep || format('1a uuid inválido | %s | %s', CASE WHEN j->>'codigo'='PAYLOAD_INVALIDO' THEN 'PASSOU' ELSE 'FALHOU' END, j) || E'\n';

    j := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id','2','itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    rep := rep || format('1b mercadinho string | %s | %s', CASE WHEN j->>'codigo'='PAYLOAD_INVALIDO' THEN 'PASSOU' ELSE 'FALHOU' END, j) || E'\n';

    j := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',1.5,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    rep := rep || format('1c mercadinho 1.5 | %s | %s', CASE WHEN j->>'codigo'='PAYLOAD_INVALIDO' THEN 'PASSOU' ELSE 'FALHOU' END, j) || E'\n';

    j := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',9223372036854775808::numeric,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    rep := rep || format('1d mercadinho overflow | %s | %s', CASE WHEN j->>'codigo'='PAYLOAD_INVALIDO' THEN 'PASSOU' ELSE 'FALHOU' END, j) || E'\n';

    j := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',0))));
    rep := rep || format('1e quantidade 0 | %s | %s', CASE WHEN j->>'codigo'='QUANTIDADE_INVALIDA' THEN 'PASSOU' ELSE 'FALHOU' END, j) || E'\n';

    j := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',-1))));
    rep := rep || format('1f quantidade -1 | %s | %s', CASE WHEN j->>'codigo'='QUANTIDADE_INVALIDA' THEN 'PASSOU' ELSE 'FALHOU' END, j) || E'\n';

    j := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1.5))));
    rep := rep || format('1g quantidade 1.5 | %s | %s', CASE WHEN j->>'codigo'='QUANTIDADE_INVALIDA' THEN 'PASSOU' ELSE 'FALHOU' END, j) || E'\n';

    j := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',2147483648::numeric))));
    rep := rep || format('1h quantidade 2147483648 | %s | %s', CASE WHEN j->>'codigo'='QUANTIDADE_INVALIDA' THEN 'PASSOU' ELSE 'FALHOU' END, j) || E'\n';

    j := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1), jsonb_build_object('prateleira_id',P,'quantidade',1))));
    rep := rep || format('1i item duplicado | %s | %s', CASE WHEN j->>'codigo'='ITEM_DUPLICADO' THEN 'PASSOU' ELSE 'FALHOU' END, j) || E'\n';

    j := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'cliente_id',cli,'tablet_id',tab,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    rid := (j->>'reserva_id')::bigint;
    SELECT r.criado_em, r.expira_em INTO crd, exp FROM public.reservas_checkout r WHERE r.id = rid;
    SELECT pp.quantidade_prateleira INTO est_depois FROM public.prateleiras_produtos pp WHERE pp.id=P;
    rep := rep || format('2 reserva válida | %s | %s',
      CASE WHEN (j->>'ok')='true' AND (j->>'reutilizada')='false' AND rid IS NOT NULL AND (j->>'valor_total')::numeric>0 AND est_depois=est_antes THEN 'PASSOU' ELSE 'FALHOU' END, j) || E'\n';
    rep := rep || format('2b janela 3 min | %s | expira_em-criado_em=%s | estoque_fisico=%s',
      CASE WHEN (exp-crd)=interval '3 minutes' THEN 'PASSOU' ELSE 'FALHOU' END, (exp-crd), est_depois) || E'\n';

    j2 := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'cliente_id',cli,'tablet_id',tab,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    SELECT count(*) INTO cnt FROM public.reservas_checkout r WHERE r.chave_idempotencia=k;
    rep := rep || format('3 idempotência retry | %s | %s | reservas_com_chave=%s',
      CASE WHEN (j2->>'ok')='true' AND (j2->>'reutilizada')='true' AND (j2->>'reserva_id')::bigint=rid AND cnt=1 THEN 'PASSOU' ELSE 'FALHOU' END, j2, cnt) || E'\n';

    j2 := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'cliente_id',cli,'tablet_id',tab,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',2))));
    rep := rep || format('4a conflito quantidade | %s | %s', CASE WHEN j2->>'codigo'='IDEMPOTENCIA_CONFLITO' THEN 'PASSOU' ELSE 'FALHOU' END, j2) || E'\n';

    j2 := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M2,'cliente_id',cli,'tablet_id',tab,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    rep := rep || format('4b conflito mercadinho | %s | %s', CASE WHEN j2->>'codigo'='IDEMPOTENCIA_CONFLITO' THEN 'PASSOU' ELSE 'FALHOU' END, j2) || E'\n';

    j2 := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'cliente_id',NULL,'tablet_id',tab,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    rep := rep || format('4c conflito cliente | %s | %s', CASE WHEN j2->>'codigo'='IDEMPOTENCIA_CONFLITO' THEN 'PASSOU' ELSE 'FALHOU' END, j2) || E'\n';

    j2 := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'cliente_id',cli,'tablet_id',NULL,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    rep := rep || format('4d conflito tablet | %s | %s', CASE WHEN j2->>'codigo'='IDEMPOTENCIA_CONFLITO' THEN 'PASSOU' ELSE 'FALHOU' END, j2) || E'\n';

    SELECT ri.valor_unitario, ri.valor_total INTO vu, vt FROM public.reservas_checkout_itens ri WHERE ri.reserva_id=rid AND ri.prateleira_id=P;
    SELECT r.valor_total INTO vtot FROM public.reservas_checkout r WHERE r.id=rid;
    rep := rep || format('7 preço e total | %s | preco_base=%s preco_esperado=%s valor_unitario=%s valor_total_item=%s valor_total_reserva=%s',
      CASE WHEN vu=v_preco_esperado AND vt=v_preco_esperado*1 AND vtot=v_preco_esperado*1 THEN 'PASSOU' ELSE 'FALHOU' END,
      v_preco, v_preco_esperado, vu, vt, vtot) || E'\n';

    j2 := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k2::text,'mercadinho_id',M,'cliente_id',cli,'tablet_id',tab,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',v_disp))));
    SELECT pp.quantidade_prateleira INTO est_depois FROM public.prateleiras_produtos pp WHERE pp.id=P;
    rep := rep || format('6 estoque insuficiente | %s | %s | estoque_fisico=%s',
      CASE WHEN j2->>'codigo'='ESTOQUE_INSUFICIENTE' AND est_depois=est_antes THEN 'PASSOU' ELSE 'FALHOU' END, j2, est_depois) || E'\n';

    UPDATE public.reservas_checkout SET cancelada_em = pg_catalog.statement_timestamp() WHERE id = rid;
    j2 := public.criar_reserva_checkout_pix(jsonb_build_object('chave_idempotencia',k::text,'mercadinho_id',M,'cliente_id',cli,'tablet_id',tab,'itens',jsonb_build_array(jsonb_build_object('prateleira_id',P,'quantidade',1))));
    rep := rep || format('5 reserva encerrada | %s | %s', CASE WHEN j2->>'codigo'='IDEMPOTENCIA_ENCERRADA' THEN 'PASSOU' ELSE 'FALHOU' END, j2) || E'\n';

    RAISE EXCEPTION 'FIM_TESTES';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'FIM_TESTES' THEN
      erro_inesperado := format('ERRO_INESPERADO sqlstate=%s msg=%s', SQLSTATE, SQLERRM);
      rep := rep || erro_inesperado || E'\n';
    END IF;
  END;

  SELECT count(*) INTO res_depois FROM public.reservas_checkout;
  SELECT count(*) INTO itens_depois FROM public.reservas_checkout_itens;
  SELECT pp.quantidade_prateleira INTO est_depois FROM public.prateleiras_produtos pp WHERE pp.id=P;
  SELECT count(*) INTO chaves_rest FROM public.reservas_checkout r WHERE r.chave_idempotencia IN (k,k2);
  SELECT count(*) INTO itens_rest FROM public.reservas_checkout_itens ri
    JOIN public.reservas_checkout r ON r.id=ri.reserva_id WHERE r.chave_idempotencia IN (k,k2);

  rep := rep || format('LIMPEZA | reservas_antes=%s reservas_depois=%s | itens_antes=%s itens_depois=%s | estoque_antes=%s estoque_depois=%s | CHAVES_TESTE_RESTANTES=%s | ITENS_TESTE_RESTANTES=%s',
    res_antes,res_depois,itens_antes,itens_depois,est_antes,est_depois,chaves_rest,itens_rest) || E'\n';

  FOR n IN 1..array_length(string_to_array(rtrim(rep,E'\n'),E'\n'),1) LOOP
    INSERT INTO _rep_testes_pix VALUES (n, (string_to_array(rtrim(rep,E'\n'),E'\n'))[n]);
  END LOOP;
  RAISE NOTICE '%', rep;
END
$do$;

SELECT linha FROM _rep_testes_pix ORDER BY ord;
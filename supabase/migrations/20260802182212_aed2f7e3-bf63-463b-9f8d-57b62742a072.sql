CREATE OR REPLACE FUNCTION public.registrar_pagamento_v3(
  p_cliente_id bigint,
  p_mes_referencia date,
  p_valor numeric,
  p_forma_pagamento text,
  p_forma_pagamento_outro text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mercadinho_id bigint;
  v_total_compras numeric := 0;
  v_total_pagos numeric := 0;
  v_restante numeric := 0;
  v_forma text;
  v_outro text;
  v_obs text;
  v_id bigint;
BEGIN
  SELECT c.mercadinho_id INTO v_mercadinho_id
  FROM public.clientes c
  WHERE c.id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  IF v_mercadinho_id IS NULL THEN
    RAISE EXCEPTION 'Cliente sem mercadinho definido.';
  END IF;

  IF p_mes_referencia IS NULL
     OR p_mes_referencia <> date_trunc('month', p_mes_referencia::timestamptz)::date THEN
    RAISE EXCEPTION 'Mês de referência inválido: deve ser o primeiro dia do mês.';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'O valor do pagamento deve ser maior que zero.';
  END IF;

  v_forma := btrim(COALESCE(p_forma_pagamento, ''));
  IF v_forma NOT IN ('PIX', 'Dinheiro', 'Cartão', 'Outro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;

  IF v_forma = 'Outro' THEN
    v_outro := NULLIF(btrim(COALESCE(p_forma_pagamento_outro, '')), '');
    IF v_outro IS NULL THEN
      RAISE EXCEPTION 'Informe a descrição da forma de pagamento.';
    END IF;
  ELSE
    v_outro := NULL;
  END IF;

  v_obs := NULLIF(btrim(COALESCE(p_observacao, '')), '');

  SELECT COALESCE(SUM(c.valor_total), 0) INTO v_total_compras
  FROM public.compras c
  WHERE c.cliente_id = p_cliente_id
    AND c.eh_visitante = false
    AND c.forma_pagamento = 'caderneta'
    AND date_trunc('month', c.data_compra AT TIME ZONE 'America/Sao_Paulo')::date = p_mes_referencia;

  SELECT COALESCE(SUM(pg.valor), 0) INTO v_total_pagos
  FROM public.pagamentos pg
  WHERE pg.cliente_id = p_cliente_id
    AND pg.mes_referencia = p_mes_referencia
    AND pg.cancelado = false;

  v_restante := v_total_compras - v_total_pagos;

  IF p_valor > v_restante THEN
    RAISE EXCEPTION 'O valor do pagamento não pode ser maior que a dívida restante deste mês.';
  END IF;

  INSERT INTO public.pagamentos (
    cliente_id, mercadinho_id, mes_referencia, valor,
    forma_pagamento, forma_pagamento_outro, observacao,
    origem, cancelado, cancelado_em, cancelado_por,
    observacao_cancelamento, criado_por, criado_em
  ) VALUES (
    p_cliente_id, v_mercadinho_id, p_mes_referencia, p_valor,
    v_forma, v_outro, v_obs,
    'manual_admin', false, NULL, NULL,
    NULL, NULL, now()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'pagamento_id', v_id,
    'total_compras_mes', v_total_compras,
    'total_pagamentos_mes', v_total_pagos + p_valor,
    'divida_restante_mes', v_restante - p_valor
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_pagamento_v3(bigint, date, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_v3(bigint, date, numeric, text, text, text) TO service_role;
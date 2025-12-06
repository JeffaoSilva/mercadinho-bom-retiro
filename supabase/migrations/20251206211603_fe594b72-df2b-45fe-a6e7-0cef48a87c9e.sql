-- 1) Criar RPC SECURITY DEFINER para finalização segura do totem
CREATE OR REPLACE FUNCTION public.criar_compra_kiosk(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra_id bigint;
  v_item jsonb;
  v_prateleira_id bigint;
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
    INSERT INTO public.itens_compra (
      compra_id,
      produto_id,
      quantidade,
      valor_unitario,
      valor_total
    )
    VALUES (
      v_compra_id,
      (v_item->>'produto_id')::bigint,
      (v_item->>'quantidade')::int,
      (v_item->>'valor_unitario')::numeric,
      (v_item->>'valor_total')::numeric
    );

    -- Baixar quantidade da prateleira específica (se informada)
    v_prateleira_id := (v_item->>'prateleira_id')::bigint;
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
$$;

-- Permitir execução para anon (totem) e authenticated (admin)
GRANT EXECUTE ON FUNCTION public.criar_compra_kiosk(jsonb) TO anon, authenticated;

-- 2) Fechar policies - remover acesso anon direto
DROP POLICY IF EXISTS "public_insert_compras" ON public.compras;
DROP POLICY IF EXISTS "public_select_compras" ON public.compras;
DROP POLICY IF EXISTS "public_insert_itens_compra" ON public.itens_compra;
DROP POLICY IF EXISTS "public_select_itens_compra" ON public.itens_compra;
DROP POLICY IF EXISTS "anon_update_prateleiras" ON public.prateleiras_produtos;

-- 3) Manter apenas policies para authenticated (admin)
-- compras: admin ALL já existe (auth_select_compras, auth_update_compras, auth_delete_compras)
-- Garantir policy completa para admin
DROP POLICY IF EXISTS "auth_select_compras" ON public.compras;
DROP POLICY IF EXISTS "auth_update_compras" ON public.compras;
DROP POLICY IF EXISTS "auth_delete_compras" ON public.compras;

CREATE POLICY "compras_admin_all"
ON public.compras
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- itens_compra: admin ALL
DROP POLICY IF EXISTS "auth_select_itens_compra" ON public.itens_compra;
DROP POLICY IF EXISTS "auth_update_itens_compra" ON public.itens_compra;
DROP POLICY IF EXISTS "auth_delete_itens_compra" ON public.itens_compra;

CREATE POLICY "itens_compra_admin_all"
ON public.itens_compra
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- prateleiras: manter SELECT anon (para carrinho ver estoque), remover UPDATE anon
-- auth_all_prateleiras já existe para admin
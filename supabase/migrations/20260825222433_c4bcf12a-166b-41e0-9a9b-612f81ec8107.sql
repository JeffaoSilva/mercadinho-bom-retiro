DO $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.criar_reserva_checkout_pix(jsonb_build_object(
    'mercadinho_id', 2,
    'cliente_id', 34,
    'tablet_id', 1,
    'chave_idempotencia', gen_random_uuid()::text,
    'itens', jsonb_build_array(
      jsonb_build_object(
        'prateleira_id', 232,
        'quantidade', 1
      )
    )
  ));
  RAISE NOTICE 'RESULTADO: %', v_res;
  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA_RESERVA: %', v_res;
  END IF;
END $$;
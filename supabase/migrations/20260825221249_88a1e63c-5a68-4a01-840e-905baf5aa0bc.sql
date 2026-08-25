DO $$
DECLARE r jsonb;
BEGIN
  r := public.criar_reserva_checkout_pix(jsonb_build_object(
    'mercadinho_id', 2,
    'cliente_id', 34,
    'tablet_id', 1,
    'chave_idempotencia', '9e48223d-7a43-4cfc-a753-0960689e7f02',
    'itens', jsonb_build_array(jsonb_build_object('prateleira_id', 232, 'quantidade', 1))
  ));
  RAISE NOTICE 'RESULTADO=%', r;
END $$;
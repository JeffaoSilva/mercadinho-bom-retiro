DO $$
DECLARE r1 jsonb; r2 jsonb; n_ab_antes int; n_ab_depois int; ids bigint[];
BEGIN
  SELECT count(*) INTO n_ab_antes FROM public.abatimentos;

  r1 := public.registrar_pagamento_v3(18,'2026-07-01',100,'Outro','Vale','teste parcial');
  r2 := public.registrar_pagamento_v3(18,'2026-07-01',747.09,'Dinheiro',NULL,NULL);
  RAISE NOTICE 'TESTE parcial=% quitacao=%', r1, r2;

  BEGIN
    PERFORM public.registrar_pagamento_v3(18,'2026-07-01',0.01,'PIX',NULL,NULL);
    RAISE NOTICE 'FALHA: excedente aceito';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'OK excedente bloqueado: %', SQLERRM;
  END;

  SELECT count(*) INTO n_ab_depois FROM public.abatimentos;
  RAISE NOTICE 'abatimentos antes=% depois=%', n_ab_antes, n_ab_depois;

  SELECT array_agg((r1->>'pagamento_id')::bigint) || array_agg((r2->>'pagamento_id')::bigint) INTO ids;
  DELETE FROM public.pagamentos WHERE id = ANY(ids);
  RAISE NOTICE 'limpeza concluida ids=%', ids;
END $$;
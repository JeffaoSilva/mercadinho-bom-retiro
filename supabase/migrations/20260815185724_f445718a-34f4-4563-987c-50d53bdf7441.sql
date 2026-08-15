CREATE TABLE public.reservas_checkout_pagbank (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reserva_id bigint NOT NULL REFERENCES public.reservas_checkout(id),
  pagbank_order_id text,
  pagbank_qr_code_id text,
  reference_id text NOT NULL,
  chave_idempotencia uuid NOT NULL,
  valor_centavos bigint NOT NULL,
  qr_code_text text,
  qr_code_png_url text,
  qr_code_base64_url text,
  status text NOT NULL DEFAULT 'CRIANDO',
  pagbank_status text,
  erro_mensagem text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  payload_criacao jsonb,
  payload_ultimo_webhook jsonb,
  CONSTRAINT reservas_checkout_pagbank_reserva_unica UNIQUE (reserva_id),
  CONSTRAINT reservas_checkout_pagbank_reference_unica UNIQUE (reference_id),
  CONSTRAINT reservas_checkout_pagbank_chave_unica UNIQUE (chave_idempotencia),
  CONSTRAINT reservas_checkout_pagbank_valor_positivo CHECK (valor_centavos > 0),
  CONSTRAINT reservas_checkout_pagbank_status_valido CHECK (status IN ('CRIANDO','ATIVA','PAGA','EXPIRADA','CANCELADA','ERRO'))
);

REVOKE ALL ON TABLE public.reservas_checkout_pagbank FROM PUBLIC;
REVOKE ALL ON TABLE public.reservas_checkout_pagbank FROM anon;
REVOKE ALL ON TABLE public.reservas_checkout_pagbank FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reservas_checkout_pagbank TO service_role;

ALTER TABLE public.reservas_checkout_pagbank ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE
  v_seq text;
BEGIN
  v_seq := pg_catalog.pg_get_serial_sequence('public.reservas_checkout_pagbank', 'id');
  IF v_seq IS NULL THEN
    RAISE EXCEPTION 'Sequencia identity nao encontrada para reservas_checkout_pagbank.id';
  END IF;
  EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', v_seq);
  EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM anon', v_seq);
  EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM authenticated', v_seq);
  EXECUTE pg_catalog.format('GRANT USAGE ON SEQUENCE %s TO service_role', v_seq);
  RAISE NOTICE 'Sequencia identity: %', v_seq;
END
$do$;

CREATE UNIQUE INDEX reservas_checkout_pagbank_order_id_uidx
  ON public.reservas_checkout_pagbank (pagbank_order_id)
  WHERE pagbank_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reservas_checkout_pagbank_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.atualizado_em = pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reservas_checkout_pagbank_touch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservas_checkout_pagbank_touch() FROM anon;
REVOKE ALL ON FUNCTION public.reservas_checkout_pagbank_touch() FROM authenticated;

CREATE TRIGGER reservas_checkout_pagbank_set_atualizado_em
BEFORE UPDATE ON public.reservas_checkout_pagbank
FOR EACH ROW
EXECUTE FUNCTION public.reservas_checkout_pagbank_touch();
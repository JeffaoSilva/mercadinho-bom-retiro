ALTER TABLE public.clientes
  ADD COLUMN email text NULL,
  ADD COLUMN tax_id text NULL;

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_tax_id_formato_chk
  CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{11}$');

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_email_formato_chk
  CHECK (
    email IS NULL
    OR (
      email = lower(btrim(email))
      AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

CREATE UNIQUE INDEX clientes_tax_id_unique_idx
  ON public.clientes (tax_id)
  WHERE tax_id IS NOT NULL;
ALTER TABLE public.conferencias_estoque_itens
  ADD COLUMN IF NOT EXISTS quantidade_sistema integer,
  ADD COLUMN IF NOT EXISTS quantidade_real integer,
  ADD COLUMN IF NOT EXISTS diferenca integer,
  ADD COLUMN IF NOT EXISTS observacao text,
  ADD COLUMN IF NOT EXISTS registrado_em timestamp with time zone;
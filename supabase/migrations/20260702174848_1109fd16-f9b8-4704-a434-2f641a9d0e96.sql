ALTER TABLE public.conferencias_estoque_itens
  ADD COLUMN IF NOT EXISTS conferido boolean NOT NULL DEFAULT true;
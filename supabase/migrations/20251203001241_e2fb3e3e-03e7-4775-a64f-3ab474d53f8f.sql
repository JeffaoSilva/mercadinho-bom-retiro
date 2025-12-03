-- Add ativo column to clientes table
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- Create or replace the view
CREATE OR REPLACE VIEW public.clientes_kiosk AS
SELECT
  id,
  nome,
  mercadinho_id,
  ativo
FROM public.clientes
WHERE ativo = true;
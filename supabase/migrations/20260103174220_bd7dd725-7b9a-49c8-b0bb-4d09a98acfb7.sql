-- Tornar preco_compra opcional (nullable)
ALTER TABLE public.produtos
  ALTER COLUMN preco_compra DROP NOT NULL;
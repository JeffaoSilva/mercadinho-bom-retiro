-- Adicionar campos de configuração de alerta de estoque baixo em produtos
ALTER TABLE public.produtos
ADD COLUMN alerta_estoque_baixo_ativo boolean NOT NULL DEFAULT false,
ADD COLUMN alerta_estoque_baixo_min integer NOT NULL DEFAULT 2;

CREATE TABLE public.conferencias_estoque (
  id BIGSERIAL PRIMARY KEY,
  mercadinho_id BIGINT NOT NULL REFERENCES public.mercadinhos(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','finalizada')),
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_atualizacao_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em TIMESTAMPTZ
);

CREATE UNIQUE INDEX conferencias_estoque_uma_aberta_por_mercadinho
  ON public.conferencias_estoque (mercadinho_id)
  WHERE status = 'em_andamento';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conferencias_estoque TO authenticated, anon;
GRANT ALL ON public.conferencias_estoque TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.conferencias_estoque_id_seq TO authenticated, anon, service_role;

ALTER TABLE public.conferencias_estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY conferencias_estoque_all ON public.conferencias_estoque FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE TABLE public.conferencias_estoque_itens (
  id BIGSERIAL PRIMARY KEY,
  conferencia_id BIGINT NOT NULL REFERENCES public.conferencias_estoque(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  conferido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conferencia_id, produto_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conferencias_estoque_itens TO authenticated, anon;
GRANT ALL ON public.conferencias_estoque_itens TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.conferencias_estoque_itens_id_seq TO authenticated, anon, service_role;

ALTER TABLE public.conferencias_estoque_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY conferencias_estoque_itens_all ON public.conferencias_estoque_itens FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

CREATE INDEX conferencias_estoque_itens_conf_idx ON public.conferencias_estoque_itens(conferencia_id);

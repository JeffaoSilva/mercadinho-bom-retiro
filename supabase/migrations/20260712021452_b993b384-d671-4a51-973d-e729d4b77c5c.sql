CREATE TABLE public.pagamentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id bigint NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  mercadinho_id bigint REFERENCES public.mercadinhos(id) ON DELETE SET NULL,
  mes_referencia date NOT NULL,
  valor numeric NOT NULL,
  forma_pagamento text NOT NULL,
  forma_pagamento_outro text,
  observacao text,
  origem text NOT NULL,
  cancelado boolean NOT NULL DEFAULT false,
  cancelado_em timestamp with time zone,
  cancelado_por bigint,
  observacao_cancelamento text,
  criado_por bigint,
  criado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT pagamentos_valor_positivo CHECK (valor > 0),
  CONSTRAINT pagamentos_forma_pagamento_valida CHECK (forma_pagamento IN ('PIX', 'Dinheiro', 'Cartão', 'Outro')),
  CONSTRAINT pagamentos_origem_valida CHECK (origem IN ('manual_admin', 'migracao_v2'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagamentos TO authenticated;
GRANT ALL ON public.pagamentos TO service_role;

CREATE INDEX idx_pagamentos_cliente_id ON public.pagamentos(cliente_id);
CREATE INDEX idx_pagamentos_mercadinho_id ON public.pagamentos(mercadinho_id);
CREATE INDEX idx_pagamentos_mes_referencia ON public.pagamentos(mes_referencia);
CREATE INDEX idx_pagamentos_cancelado ON public.pagamentos(cancelado);
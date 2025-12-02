-- Adicionar coluna tablet_id na tabela tela_descanso
ALTER TABLE public.tela_descanso 
ADD COLUMN IF NOT EXISTS tablet_id bigint NULL REFERENCES public.tablets(id) ON DELETE CASCADE;

-- Criar índice para buscas por tablet_id
CREATE INDEX IF NOT EXISTS idx_tela_descanso_tablet_id ON public.tela_descanso(tablet_id);
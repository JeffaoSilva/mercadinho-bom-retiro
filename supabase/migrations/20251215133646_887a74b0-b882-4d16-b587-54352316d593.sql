-- Adicionar colunas de notificação de venda e contadores Ao Vivo em config_sistema
ALTER TABLE public.config_sistema
ADD COLUMN notif_venda_popup_ativo boolean NOT NULL DEFAULT true,
ADD COLUMN notif_venda_som_ativo boolean NOT NULL DEFAULT true,
ADD COLUMN notif_venda_som_volume integer NOT NULL DEFAULT 70,
ADD COLUMN notif_venda_som_br text NOT NULL DEFAULT 'beep1',
ADD COLUMN notif_venda_som_sf text NOT NULL DEFAULT 'beep2',
ADD COLUMN ao_vivo_contador_br_metrica text NOT NULL DEFAULT 'qtd',
ADD COLUMN ao_vivo_contador_br_periodo text NOT NULL DEFAULT 'dia',
ADD COLUMN ao_vivo_contador_sf_metrica text NOT NULL DEFAULT 'qtd',
ADD COLUMN ao_vivo_contador_sf_periodo text NOT NULL DEFAULT 'dia';
-- Habilitar realtime para config_sistema e config_pagamentos_mensais
ALTER TABLE public.config_sistema REPLICA IDENTITY FULL;
ALTER TABLE public.config_pagamentos_mensais REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.config_sistema;
ALTER PUBLICATION supabase_realtime ADD TABLE public.config_pagamentos_mensais;
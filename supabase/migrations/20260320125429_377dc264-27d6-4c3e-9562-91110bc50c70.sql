ALTER TABLE public.config_sistema
ADD COLUMN IF NOT EXISTS pix_chave text DEFAULT '',
ADD COLUMN IF NOT EXISTS pix_qr_code_url text DEFAULT '';
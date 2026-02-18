ALTER TABLE public.mercadinhos
  ADD COLUMN IF NOT EXISTS badge_bg_color text,
  ADD COLUMN IF NOT EXISTS badge_text_color text;
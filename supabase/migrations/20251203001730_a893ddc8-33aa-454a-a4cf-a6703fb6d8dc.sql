-- Enable RLS on compras and itens_compra
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_compra ENABLE ROW LEVEL SECURITY;

-- Anon can only INSERT (kiosk)
CREATE POLICY "compras_anon_insert"
ON public.compras
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "itens_anon_insert"
ON public.itens_compra
FOR INSERT
TO anon
WITH CHECK (true);

-- Authenticated (admin) can do everything
CREATE POLICY "compras_admin_all"
ON public.compras
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "itens_admin_all"
ON public.itens_compra
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
-- Corrigir policies de compras: mudar de RESTRICTIVE para PERMISSIVE
DROP POLICY IF EXISTS "public_insert_compras" ON public.compras;
DROP POLICY IF EXISTS "public_select_compras" ON public.compras;

-- Recriar como PERMISSIVE (padrão)
CREATE POLICY "public_insert_compras" 
ON public.compras 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "public_select_compras" 
ON public.compras 
FOR SELECT 
TO anon, authenticated
USING (true);

-- Corrigir policies de itens_compra também
DROP POLICY IF EXISTS "public_insert_itens_compra" ON public.itens_compra;
DROP POLICY IF EXISTS "public_select_itens_compra" ON public.itens_compra;

CREATE POLICY "public_insert_itens_compra" 
ON public.itens_compra 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "public_select_itens_compra" 
ON public.itens_compra 
FOR SELECT 
TO anon, authenticated
USING (true);

-- Garantir que prateleiras_produtos permite UPDATE anon para baixa de estoque
DROP POLICY IF EXISTS "anon_update_prateleiras" ON public.prateleiras_produtos;

CREATE POLICY "anon_update_prateleiras" 
ON public.prateleiras_produtos 
FOR UPDATE 
TO anon
USING (true)
WITH CHECK (true);
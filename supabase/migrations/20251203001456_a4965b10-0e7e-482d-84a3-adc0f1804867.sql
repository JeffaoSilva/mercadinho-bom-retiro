-- Enable RLS on clientes table
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Policy: only authenticated users can select
CREATE POLICY "clientes_somente_admin_select"
ON public.clientes
FOR SELECT
TO authenticated
USING (true);

-- Policy: only authenticated users can insert/update/delete
CREATE POLICY "clientes_somente_admin_all"
ON public.clientes
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
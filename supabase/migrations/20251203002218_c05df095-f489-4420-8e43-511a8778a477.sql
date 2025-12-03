-- Enable RLS on pins
ALTER TABLE public.pins ENABLE ROW LEVEL SECURITY;

-- Anon can SELECT
CREATE POLICY "pins_anon_select"
ON public.pins
FOR SELECT
TO anon
USING (true);

-- Anon can INSERT
CREATE POLICY "pins_anon_insert"
ON public.pins
FOR INSERT
TO anon
WITH CHECK (true);

-- Authenticated (admin) can do everything
CREATE POLICY "pins_admin_all"
ON public.pins
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
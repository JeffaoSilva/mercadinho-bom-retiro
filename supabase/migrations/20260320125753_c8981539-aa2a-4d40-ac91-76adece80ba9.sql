CREATE POLICY "Allow authenticated uploads to pix-qrcode"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pix-qrcode');

CREATE POLICY "Allow public read pix-qrcode"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'pix-qrcode');
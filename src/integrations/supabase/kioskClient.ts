import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://eswiduysxxpdylowkdzm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzd2lkdXlzeHhwZHlsb3drZHptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3ODc0NDUsImV4cCI6MjA3OTM2MzQ0NX0._pY90RYLRFedkUZktPY2fZ7mqxfnbyHVzZ1sg5RqddY";

// Client isolado do kiosk: storageKey própria para NUNCA colidir com a sessão do Admin.
export const supabaseKiosk = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: 'kiosk-auth-token',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/** Garante uma sessão anônima do kiosk, reutilizando a existente. */
export async function garantirSessaoKiosk() {
  const { data: { session } } = await supabaseKiosk.auth.getSession();
  if (session) return session;
  const { data, error } = await supabaseKiosk.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

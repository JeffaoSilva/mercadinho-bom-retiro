// Capability token opaco para consulta de status do checkout PIX.
// Derivado server-side via HMAC-SHA256; nunca armazenado, nunca reversível.
// A chave HMAC é o service_role (somente server-side, nunca exposto).

const enc = new TextEncoder();

async function chaveHmac(): Promise<CryptoKey> {
  const segredo = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function gerarCheckoutToken(
  reservaId: number,
  chaveIdempotencia: string,
): Promise<string> {
  const key = await chaveHmac();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`checkout_pix:${reservaId}:${chaveIdempotencia.toLowerCase()}`),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparação em tempo constante (sem early-return). */
export function tokensIguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

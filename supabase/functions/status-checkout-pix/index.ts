// Edge Function: status-checkout-pix
// Consulta somente o estado do próprio checkout PIX, provando posse do
// checkout_token (capability derivada server-side). Nunca expõe payloads,
// erros internos ou PII.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gerarCheckoutToken, tokensIguais } from "../_shared/checkoutToken.ts";

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function erro(codigo: string, status = 400): Response {
  return json({ ok: false, codigo }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return erro("METODO_NAO_PERMITIDO", 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return erro("NAO_AUTENTICADO", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: eUser } = await authClient.auth.getUser();
  if (eUser || !userData?.user) return erro("NAO_AUTENTICADO", 401);

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return erro("JSON_INVALIDO", 400);
  }

  const reservaId = body?.reserva_id;
  const token = body?.checkout_token;
  if (
    typeof reservaId !== "number" || !Number.isSafeInteger(reservaId) ||
    reservaId <= 0
  ) {
    return erro("RESERVA_ID_INVALIDO", 400);
  }
  if (typeof token !== "string" || token.length !== 64) {
    return erro("CHECKOUT_TOKEN_INVALIDO", 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: reserva, error: eReserva } = await admin
    .from("reservas_checkout")
    .select("id, chave_idempotencia, expira_em, confirmada_em, cancelada_em")
    .eq("id", reservaId)
    .maybeSingle();
  if (eReserva) return erro("ERRO_BANCO", 500);
  // Resposta idêntica para reserva inexistente e token errado: sem enumeração.
  if (!reserva) return erro("CHECKOUT_TOKEN_INVALIDO", 401);

  const esperado = await gerarCheckoutToken(
    reservaId,
    String(reserva.chave_idempotencia),
  );
  if (!tokensIguais(esperado, token.toLowerCase())) {
    return erro("CHECKOUT_TOKEN_INVALIDO", 401);
  }

  const { data: cobranca, error: eCob } = await admin
    .from("reservas_checkout_pagbank")
    .select("status, compra_id")
    .eq("reserva_id", reservaId)
    .maybeSingle();
  if (eCob) return erro("ERRO_BANCO", 500);

  // ---------- Mapeamento para os únicos estados de UI ----------
  let status: "AGUARDANDO" | "PAGA" | "EXPIRADA" | "CANCELADA" | "ERRO";
  const expirou = new Date(String(reserva.expira_em)).getTime() <= Date.now();

  if (cobranca?.status === "PAGA" || cobranca?.compra_id || reserva.confirmada_em) {
    status = "PAGA";
  } else if (reserva.cancelada_em || cobranca?.status === "CANCELADA") {
    status = "CANCELADA";
  } else if (cobranca?.status === "ERRO") {
    status = "ERRO";
  } else if (expirou || cobranca?.status === "EXPIRADA") {
    status = "EXPIRADA";
  } else {
    status = "AGUARDANDO";
  }

  return json({
    ok: true,
    reserva_id: reservaId,
    status,
    expira_em: reserva.expira_em,
    ...(status === "PAGA" && cobranca?.compra_id
      ? { compra_id: cobranca.compra_id }
      : {}),
  });
});

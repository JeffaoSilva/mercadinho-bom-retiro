// Edge Function: iniciar-checkout-pix
// Orquestra o início do checkout PIX do kiosk:
//   1. valida JWT e contexto (tablet, cliente, itens);
//   2. cria a reserva via public.criar_reserva_checkout_pix (autoridade de
//      preço/promoção/estoque/total);
//   3. reutiliza a Edge Function criar-pix-pagbank para gerar a cobrança.
//
// NÃO calcula preço. NÃO aceita valores do frontend. NÃO finaliza venda.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gerarCheckoutToken } from "../_shared/checkoutToken.ts";

type Json = Record<string, unknown>;

const MAX_ITENS = 100;
const MAX_QTD = 999;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function erro(codigo: string, status = 400, extra: Json = {}): Response {
  return json({ ok: false, codigo, ...extra }, status);
}

function inteiroPositivo(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) return null;
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return erro("METODO_NAO_PERMITIDO", 405);

  // ---------- JWT (verify_jwt = true; validado também em código) ----------
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

  // ---------- Contrato de entrada ----------
  let body: Json;
  try {
    body = await req.json();
  } catch {
    return erro("JSON_INVALIDO", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return erro("PAYLOAD_INVALIDO", 400);
  }

  const mercadinhoId = inteiroPositivo(body.mercadinho_id);
  const tabletId = inteiroPositivo(body.tablet_id);
  const clienteId = inteiroPositivo(body.cliente_id);
  if (!mercadinhoId) return erro("MERCADINHO_INVALIDO", 400);
  if (!tabletId) return erro("TABLET_INVALIDO", 400);
  if (!clienteId) return erro("CLIENTE_INVALIDO", 400);

  const chaveRaw = body.chave_idempotencia;
  if (typeof chaveRaw !== "string" || !UUID_RE.test(chaveRaw)) {
    return erro("CHAVE_IDEMPOTENCIA_INVALIDA", 400);
  }
  const chave = chaveRaw.toLowerCase();

  const itensRaw = body.itens;
  if (!Array.isArray(itensRaw) || itensRaw.length === 0) {
    return erro("ITENS_INVALIDOS", 400);
  }
  if (itensRaw.length > MAX_ITENS) return erro("ITENS_EXCEDEM_LIMITE", 400);

  const itens: { prateleira_id: number; quantidade: number }[] = [];
  const vistos = new Set<number>();
  for (const it of itensRaw) {
    if (!it || typeof it !== "object" || Array.isArray(it)) {
      return erro("ITENS_INVALIDOS", 400);
    }
    const prateleiraId = inteiroPositivo((it as Json).prateleira_id);
    const quantidade = inteiroPositivo((it as Json).quantidade);
    if (!prateleiraId) return erro("PRATELEIRA_INVALIDA", 400);
    if (!quantidade || quantidade > MAX_QTD) {
      return erro("QUANTIDADE_INVALIDA", 400);
    }
    if (vistos.has(prateleiraId)) return erro("ITEM_DUPLICADO", 400);
    vistos.add(prateleiraId);
    itens.push({ prateleira_id: prateleiraId, quantidade });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ---------- Validação de contexto server-side ----------
  const { data: tablet, error: eTablet } = await admin
    .from("tablets")
    .select("id, mercadinho_id, ativo")
    .eq("id", tabletId)
    .maybeSingle();
  if (eTablet) return erro("ERRO_BANCO", 500);
  if (!tablet) return erro("TABLET_INVALIDO", 422);
  if (tablet.ativo === false) return erro("TABLET_INATIVO", 422);
  if (Number(tablet.mercadinho_id) !== mercadinhoId) {
    return erro("TABLET_OUTRO_MERCADINHO", 422);
  }

  const { data: cliente, error: eCliente } = await admin
    .from("clientes")
    .select("id, ativo")
    .eq("id", clienteId)
    .maybeSingle();
  if (eCliente) return erro("ERRO_BANCO", 500);
  if (!cliente) return erro("CLIENTE_INVALIDO", 422);
  if (cliente.ativo === false) return erro("CLIENTE_INATIVO", 422);

  const { data: prateleiras, error: ePrat } = await admin
    .from("prateleiras_produtos")
    .select("id, mercadinho_id, ativo")
    .in("id", itens.map((i) => i.prateleira_id));
  if (ePrat) return erro("ERRO_BANCO", 500);
  if (!prateleiras || prateleiras.length !== itens.length) {
    return erro("PRATELEIRA_INVALIDA", 422);
  }
  for (const p of prateleiras) {
    if (Number(p.mercadinho_id) !== mercadinhoId) {
      return erro("PRATELEIRA_OUTRO_MERCADINHO", 422);
    }
    if (p.ativo === false) return erro("PRATELEIRA_INATIVA", 422);
  }

  // ---------- Reserva (autoridade financeira) ----------
  const { data: reservaRes, error: eReserva } = await admin.rpc(
    "criar_reserva_checkout_pix",
    {
      payload: {
        chave_idempotencia: chave,
        mercadinho_id: mercadinhoId,
        cliente_id: clienteId,
        tablet_id: tabletId,
        itens,
      },
    },
  );
  if (eReserva) return erro("ERRO_RESERVA", 500);

  const reserva = reservaRes as Json | null;
  if (!reserva || reserva.ok !== true) {
    const codigo = typeof reserva?.codigo === "string"
      ? reserva.codigo
      : "ERRO_RESERVA";
    // Reserva falhou: NÃO chamar o PagBank.
    return erro(codigo, 422);
  }

  const reservaId = Number(reserva.reserva_id);
  const valorTotal = Number(reserva.valor_total);
  const expiraEm = reserva.expira_em as string;

  // ---------- Cobrança: reutiliza criar-pix-pagbank sem duplicar lógica -----
  let cobranca: Json | null = null;
  let cobrancaStatus = 0;
  try {
    const r = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/criar-pix-pagbank`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reserva_id: reservaId,
          chave_idempotencia: chave,
        }),
      },
    );
    cobrancaStatus = r.status;
    cobranca = await r.json().catch(() => null);
  } catch {
    return erro("COBRANCA_INDISPONIVEL", 504, { reserva_id: reservaId });
  }

  if (!cobranca || cobranca.ok !== true) {
    const codigo = typeof cobranca?.codigo === "string"
      ? cobranca.codigo
      : "ERRO_COBRANCA";
    return erro(codigo, cobrancaStatus >= 400 ? cobrancaStatus : 422, {
      reserva_id: reservaId,
    });
  }

  const checkoutToken = await gerarCheckoutToken(reservaId, chave);

  return json({
    ok: true,
    reserva_id: reservaId,
    valor_total: valorTotal,
    expira_em: expiraEm,
    qr_code_text: cobranca.qr_code_text ?? null,
    qr_code_png_url: cobranca.qr_code_png_url ?? null,
    status: "AGUARDANDO",
    checkout_token: checkoutToken,
  });
});

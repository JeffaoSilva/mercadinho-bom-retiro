// Edge Function: pagbank-webhook
// FASE 1 — Apenas recepção segura e autenticada do webhook PagBank.
//
// NÃO finaliza venda. NÃO cria compra. NÃO baixa estoque. NÃO confirma reserva.
// Somente valida autenticidade (x-authenticity-token), identifica o pedido e
// armazena uma versão SANITIZADA do payload.

import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function erro(codigo: string, status: number): Response {
  return json({ ok: false, codigo }, status);
}

// ---- Diagnóstico sanitizado temporário (somente runtime; nunca PII/segredos) ----
interface Diag {
  metodo?: string;
  content_type?: string | null;
  body_bytes?: number;
  has_authenticity_token?: boolean;
  has_payload_signature?: boolean;
  payload_signature_count?: number;
  has_product_origin?: boolean;
  product_origin?: string | null;
  has_product_id?: boolean;
  product_id_mask?: string | null;
  validacao?: string;
  motivo?: string;
  http?: number;
}

function mascararId(v: string | null): string | null {
  if (!v) return null;
  return v.length <= 6 ? "***" : `...${v.slice(-6)}`;
}

function logDiag(d: Diag): void {
  try {
    console.log("webhook-diag", JSON.stringify({ ts: new Date().toISOString(), ...d }));
  } catch {
    // nunca quebrar o webhook por causa do log
  }
}

// Comparação de tempo constante entre duas strings hexadecimais.
function comparacaoSegura(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, 200) : null;
}

function inteiro(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) ? v : null;
}

// Mantém apenas dados técnicos. Nenhuma PII (customer, endereço, telefone,
// e-mail, tax_id), nenhum header, nenhum token.
function sanitizarWebhook(p: Json): Json {
  const charges = Array.isArray(p.charges) ? p.charges : [];
  const qrCodes = Array.isArray(p.qr_codes) ? p.qr_codes : [];
  return {
    id: str(p.id),
    reference_id: str(p.reference_id),
    created_at: str(p.created_at),
    charges: charges.slice(0, 20).map((c) => {
      const ch = (c ?? {}) as Json;
      const amount = (ch.amount ?? {}) as Json;
      const pm = (ch.payment_method ?? {}) as Json;
      return {
        id: str(ch.id),
        reference_id: str(ch.reference_id),
        status: str(ch.status),
        created_at: str(ch.created_at),
        paid_at: str(ch.paid_at),
        amount_value: inteiro(amount.value),
        amount_currency: str(amount.currency),
        payment_method_type: str(pm.type),
      };
    }),
    qr_codes: qrCodes.slice(0, 20).map((q) => {
      const qr = (q ?? {}) as Json;
      const amount = (qr.amount ?? {}) as Json;
      return {
        id: str(qr.id),
        amount_value: inteiro(amount.value),
        expiration_date: str(qr.expiration_date),
      };
    }),
    recebido_em: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return erro("METODO_NAO_PERMITIDO", 405);
  }

  const pagbankToken = Deno.env.get("PAGBANK_TOKEN");
  if (!pagbankToken) {
    return erro("PAGBANK_TOKEN_NAO_CONFIGURADO", 500);
  }

  // ---- Corpo BRUTO antes de qualquer parse ----
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return erro("PAYLOAD_INVALIDO", 400);
  }

  // ---- Autenticidade ----
  const assinatura = req.headers.get("x-authenticity-token");
  if (!assinatura) {
    return erro("ASSINATURA_AUSENTE", 401);
  }

  const esperada = await sha256Hex(`${pagbankToken}-${rawBody}`);
  if (!comparacaoSegura(esperada, assinatura.trim().toLowerCase())) {
    return erro("ASSINATURA_INVALIDA", 403);
  }

  // ---- Parse somente após assinatura válida ----
  let payload: Json;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return erro("PAYLOAD_INVALIDO", 400);
    }
    payload = parsed as Json;
  } catch {
    return erro("PAYLOAD_INVALIDO", 400);
  }

  const orderId = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!orderId) {
    return erro("PAYLOAD_INVALIDO", 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: cobranca, error: eCob } = await supabase
    .from("reservas_checkout_pagbank")
    .select("id, reserva_id, pagbank_order_id, reference_id, valor_centavos, status")
    .eq("pagbank_order_id", orderId)
    .maybeSingle();

  if (eCob) return erro("ERRO_BANCO", 500);

  if (!cobranca) {
    // 200 para não gerar retries infinitos; nenhum registro é criado.
    console.log("webhook: pedido nao encontrado localmente");
    return json({ ok: true, resultado: "PEDIDO_NAO_ENCONTRADO" }, 200);
  }

  // Reserva correspondente (apenas leitura de contexto; nada é alterado).
  await supabase
    .from("reservas_checkout")
    .select("id, confirmada_em, cancelada_em, expira_em")
    .eq("id", cobranca.reserva_id)
    .maybeSingle();

  const sanitizado = sanitizarWebhook(payload);
  const chargesSan = (sanitizado.charges as Json[]) ?? [];
  const primeira = chargesSan[0] ?? null;
  const statusObservado = primeira ? (primeira.status as string | null) : null;

  // ---- Valor (em centavos, sem floating point) ----
  let divergencia = false;
  const valorWebhook = primeira && typeof primeira.amount_value === "number"
    ? (primeira.amount_value as number)
    : (sanitizado.qr_codes as Json[])?.[0]?.amount_value ?? null;

  if (typeof valorWebhook === "number") {
    if (valorWebhook !== Number(cobranca.valor_centavos)) {
      divergencia = true;
    }
  }

  const update: Json = {
    payload_ultimo_webhook: sanitizado,
  };
  if (statusObservado) update.pagbank_status = statusObservado;
  if (divergencia) update.erro_mensagem = "WEBHOOK_VALOR_DIVERGENTE";

  // Idempotente: mesma entrada produz sempre o mesmo estado; nunca insere linha.
  const { error: eUp } = await supabase
    .from("reservas_checkout_pagbank")
    .update(update)
    .eq("id", cobranca.id);

  if (eUp) return erro("ERRO_BANCO", 500);

  // ---- Finalização: somente status PAID e valor extraído com segurança ----
  if (statusObservado !== "PAID") {
    return json({
      ok: true,
      resultado: divergencia ? "VALOR_DIVERGENTE" : "WEBHOOK_REGISTRADO",
      pagbank_status: statusObservado,
    }, 200);
  }

  if (typeof valorWebhook !== "number" || !Number.isSafeInteger(valorWebhook) || valorWebhook <= 0) {
    await supabase
      .from("reservas_checkout_pagbank")
      .update({ erro_mensagem: "WEBHOOK_VALOR_NAO_EXTRAIDO" })
      .eq("id", cobranca.id);
    return json({ ok: false, resultado: "VALOR_NAO_EXTRAIDO" }, 200);
  }

  // Toda a lógica financeira/estoque vive na RPC (SECURITY DEFINER, service_role).
  const { data: rpcData, error: eRpc } = await supabase.rpc(
    "finalizar_venda_pix_pagbank",
    {
      payload: {
        pagbank_order_id: orderId,
        status_pagbank: "PAID",
        valor_centavos: valorWebhook,
      },
    },
  );

  if (eRpc) {
    // Exceções controladas da RPC: FIN_PIX:<CODIGO>. Nunca expor stack/detalhe interno.
    const bruto = typeof eRpc.message === "string" ? eRpc.message : "";
    const m = bruto.match(/FIN_PIX:([A-Z_]{3,60})/);
    const codigo = m ? m[1] : "ERRO_FINALIZACAO";
    console.log("webhook: finalizacao nao concluida", codigo);
    await supabase
      .from("reservas_checkout_pagbank")
      .update({ erro_mensagem: codigo })
      .eq("id", cobranca.id);
    return json({ ok: false, resultado: codigo }, 200);
  }

  const res = (rpcData ?? {}) as Json;

  if (res.ok !== true) {
    const codigo = typeof res.codigo === "string" ? res.codigo.slice(0, 60) : "ERRO_FINALIZACAO";
    await supabase
      .from("reservas_checkout_pagbank")
      .update({ erro_mensagem: codigo })
      .eq("id", cobranca.id);
    return json({ ok: false, resultado: codigo }, 200);
  }

  // Sucesso: a RPC já marcou cobrança como PAGA. Nada é sobrescrito aqui.
  return json({
    ok: true,
    resultado: res.reutilizada === true ? "JA_FINALIZADA" : "VENDA_FINALIZADA",
    reutilizada: res.reutilizada === true,
    pagbank_status: "PAID",
  }, 200);
});

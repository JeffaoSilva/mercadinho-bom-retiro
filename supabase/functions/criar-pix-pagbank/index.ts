// Edge Function: criar-pix-pagbank
// Cria (de forma idempotente) o pedido PIX + QR Code no PagBank a partir de uma
// reserva PIX já validada em public.reservas_checkout.
//
// NÃO finaliza venda. NÃO baixa estoque. NÃO confirma reserva. NÃO trata webhook.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TIMEOUT_MS = 20000;

type Json = Record<string, unknown>;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function erro(codigo: string, status = 400, extra: Json = {}): Response {
  return json({ ok: false, codigo, ...extra }, status);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Converte um valor monetário decimal em centavos de forma determinística.
// Aceita apenas até 2 casas decimais. Retorna null se a conversão não for exata.
function paraCentavos(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const s = typeof valor === "number" ? String(valor) : String(valor).trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const sinal = m[1] === "-" ? -1 : 1;
  const inteiro = m[2];
  const dec = (m[3] ?? "").padEnd(2, "0");
  const centavos = sinal * (Number(inteiro) * 100 + Number(dec));
  if (!Number.isSafeInteger(centavos)) return null;
  return centavos;
}

function sanitizarErro(msg: unknown): string {
  const s = typeof msg === "string" ? msg : JSON.stringify(msg ?? "");
  return s.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "[REDACTED]").slice(0, 500);
}

// Remove qualquer dado sensível antes de persistir o payload de criação.
function sanitizarPayloadCriacao(payload: Json): Json {
  const p = JSON.parse(JSON.stringify(payload));
  if (p.customer) {
    p.customer = { presente: true };
  }
  return p;
}

function extrairLink(links: unknown, rel: string): string | null {
  if (!Array.isArray(links)) return null;
  const l = links.find(
    (x) => x && typeof x === "object" && (x as Json).rel === rel,
  ) as Json | undefined;
  const href = l?.href;
  return typeof href === "string" ? href : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return erro("METODO_NAO_PERMITIDO", 405);
  }

  // ---------------- Etapa 2: contrato de entrada ----------------
  let body: Json;
  try {
    body = await req.json();
  } catch {
    return erro("JSON_INVALIDO", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return erro("PAYLOAD_INVALIDO", 400);
  }

  const reservaIdRaw = (body as Json).reserva_id;
  if (
    typeof reservaIdRaw !== "number" ||
    !Number.isSafeInteger(reservaIdRaw) ||
    reservaIdRaw <= 0
  ) {
    return erro("RESERVA_ID_INVALIDO", 400);
  }
  const reservaId = reservaIdRaw;

  const chaveRaw = (body as Json).chave_idempotencia;
  if (typeof chaveRaw !== "string" || !UUID_RE.test(chaveRaw)) {
    return erro("CHAVE_IDEMPOTENCIA_INVALIDA", 400);
  }
  const chave = chaveRaw.toLowerCase();

  // ---------------- Etapa 12: configuração PagBank ----------------
  const pagbankEnv = Deno.env.get("PAGBANK_ENV");
  if (pagbankEnv !== "sandbox" && pagbankEnv !== "production") {
    return erro("CONFIGURACAO_PAGBANK_INVALIDA", 500);
  }
  const pagbankToken = Deno.env.get("PAGBANK_TOKEN");
  if (!pagbankToken) {
    return erro("PAGBANK_TOKEN_NAO_CONFIGURADO", 500);
  }
  const baseUrl = pagbankEnv === "sandbox"
    ? "https://sandbox.api.pagseguro.com"
    : "https://api.pagseguro.com";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ---------------- Etapa 4: validar reserva ----------------
  const { data: reserva, error: eReserva } = await supabase
    .from("reservas_checkout")
    .select(
      "id, cliente_id, mercadinho_id, forma_pagamento, valor_total, expira_em, confirmada_em, cancelada_em",
    )
    .eq("id", reservaId)
    .maybeSingle();

  if (eReserva) return erro("ERRO_BANCO", 500);
  if (!reserva) return erro("RESERVA_NAO_ENCONTRADA", 404);
  if (reserva.forma_pagamento !== "pix") return erro("RESERVA_NAO_PIX", 409);
  if (reserva.confirmada_em) return erro("RESERVA_CONFIRMADA", 409);
  if (reserva.cancelada_em) return erro("RESERVA_CANCELADA", 409);

  const expiraEm = new Date(reserva.expira_em as string);
  if (!(expiraEm.getTime() > Date.now())) return erro("RESERVA_EXPIRADA", 409);

  const totalReservaCentavos = paraCentavos(reserva.valor_total);
  if (totalReservaCentavos === null || totalReservaCentavos <= 0) {
    return erro("VALOR_INVALIDO", 422);
  }

  const { data: itens, error: eItens } = await supabase
    .from("reservas_checkout_itens")
    .select("id, prateleira_id, quantidade, valor_unitario, valor_total")
    .eq("reserva_id", reservaId)
    .order("prateleira_id", { ascending: true });

  if (eItens) return erro("ERRO_BANCO", 500);
  if (!itens || itens.length === 0) return erro("RESERVA_SEM_ITENS", 422);

  // ---------------- Etapa 5: consistência financeira ----------------
  let somaCentavos = 0;
  const itensCalc: {
    prateleira_id: number;
    quantidade: number;
    unit_centavos: number;
  }[] = [];

  for (const it of itens) {
    const q = it.quantidade;
    if (typeof q !== "number" || !Number.isSafeInteger(q) || q <= 0) {
      return erro("QUANTIDADE_INVALIDA", 422);
    }
    const unit = paraCentavos(it.valor_unitario);
    const tot = paraCentavos(it.valor_total);
    if (unit === null || tot === null || unit < 0 || tot < 0) {
      return erro("VALOR_INVALIDO", 422);
    }
    if (unit * q !== tot) return erro("TOTAL_ITEM_INCONSISTENTE", 422);
    somaCentavos += tot;
    itensCalc.push({
      prateleira_id: it.prateleira_id as number,
      quantidade: q,
      unit_centavos: unit,
    });
  }

  if (somaCentavos !== totalReservaCentavos) {
    return erro("TOTAL_RESERVA_INCONSISTENTE", 422);
  }
  const valorCentavos = totalReservaCentavos;

  // ---------------- Etapa 8: reference_id determinístico ----------------
  const referenceId = `reserva_pix_${reservaId}`;

  // ---------------- Etapa 6: idempotência local ----------------
  const lerCobranca = async () => {
    const { data, error } = await supabase
      .from("reservas_checkout_pagbank")
      .select("*")
      .eq("reserva_id", reservaId)
      .maybeSingle();
    if (error) throw new Error("ERRO_BANCO");
    return data;
  };

  const respostaCobranca = (c: Json, reutilizada: boolean) =>
    json({
      ok: true,
      reutilizada,
      reserva_id: reservaId,
      pagbank_order_id: c.pagbank_order_id ?? null,
      qr_code_text: c.qr_code_text ?? null,
      qr_code_png_url: c.qr_code_png_url ?? null,
      qr_code_base64_url: c.qr_code_base64_url ?? null,
      expira_em: reserva.expira_em,
      valor_centavos: Number(c.valor_centavos ?? valorCentavos),
    });

  const avaliarExistente = (c: Json): Response => {
    if (String(c.chave_idempotencia).toLowerCase() !== chave) {
      return erro("COBRANCA_JA_EXISTE", 409);
    }
    if (c.status === "ATIVA" && c.pagbank_order_id && c.qr_code_text) {
      return respostaCobranca(c, true);
    }
    // CRIANDO / ERRO / demais estados: nunca criar outra identidade.
    return erro("COBRANCA_EM_ESTADO_NAO_REUTILIZAVEL", 409, {
      status: c.status,
    });
  };

  let existente: Json | null = null;
  try {
    existente = (await lerCobranca()) as Json | null;
  } catch {
    return erro("ERRO_BANCO", 500);
  }
  if (existente) return avaliarExistente(existente);

  // ---------------- Etapa 9: customer PagBank ----------------
  // POST /orders exige customer.name, customer.email e customer.tax_id.
  // public.clientes possui apenas: nome, telefone (sem email, sem CPF).
  const camposAusentes: string[] = [];
  let clienteNome: string | null = null;

  if (reserva.cliente_id === null || reserva.cliente_id === undefined) {
    camposAusentes.push("customer.name", "customer.email", "customer.tax_id");
  } else {
    const { data: cliente, error: eCliente } = await supabase
      .from("clientes")
      .select("id, nome, telefone")
      .eq("id", reserva.cliente_id)
      .maybeSingle();
    if (eCliente) return erro("ERRO_BANCO", 500);
    if (!cliente) {
      camposAusentes.push("customer.name", "customer.email", "customer.tax_id");
    } else {
      clienteNome = typeof cliente.nome === "string" ? cliente.nome.trim() : "";
      if (!clienteNome) camposAusentes.push("customer.name");
      // Não existem colunas de email nem CPF em public.clientes.
      camposAusentes.push("customer.email", "customer.tax_id");
    }
  }

  if (camposAusentes.length > 0) {
    return erro("DADO_OBRIGATORIO_PAGBANK_AUSENTE", 422, {
      campos_ausentes: camposAusentes,
    });
  }

  // ---------------- Etapa 10: items ----------------
  const prateleiraIds = [...new Set(itensCalc.map((i) => i.prateleira_id))];
  const { data: prateleiras, error: ePrat } = await supabase
    .from("prateleiras_produtos")
    .select("id, produto_id, produtos(nome)")
    .in("id", prateleiraIds);
  if (ePrat) return erro("ERRO_BANCO", 500);

  const nomePorPrateleira = new Map<number, string>();
  for (const p of prateleiras ?? []) {
    const prod = (p as Json).produtos as Json | null;
    const nome = prod && typeof prod.nome === "string" ? prod.nome : "Produto";
    nomePorPrateleira.set((p as Json).id as number, nome);
  }

  const pagbankItems = itensCalc.map((i) => ({
    reference_id: `prateleira_${i.prateleira_id}`,
    name: (nomePorPrateleira.get(i.prateleira_id) ?? "Produto").slice(0, 100),
    quantity: i.quantidade,
    unit_amount: i.unit_centavos,
  }));

  // ---------------- Etapa 7: reivindicação local (status CRIANDO) --------
  const { data: criando, error: eInsert } = await supabase
    .from("reservas_checkout_pagbank")
    .insert({
      reserva_id: reservaId,
      reference_id: referenceId,
      chave_idempotencia: chave,
      valor_centavos: valorCentavos,
      status: "CRIANDO",
    })
    .select("*")
    .maybeSingle();

  if (eInsert) {
    // 23505 = unique_violation (concorrência) -> reler e aplicar idempotência
    if ((eInsert as Json).code === "23505") {
      try {
        const c = (await lerCobranca()) as Json | null;
        if (c) return avaliarExistente(c);
      } catch {
        return erro("ERRO_BANCO", 500);
      }
      return erro("COBRANCA_JA_EXISTE", 409);
    }
    return erro("ERRO_BANCO", 500);
  }
  if (!criando) return erro("ERRO_BANCO", 500);

  const marcarErro = async (codigo: string, detalhe?: unknown) => {
    await supabase
      .from("reservas_checkout_pagbank")
      .update({
        status: "ERRO",
        erro_mensagem: sanitizarErro(detalhe ?? codigo),
      })
      .eq("reserva_id", reservaId)
      .eq("status", "CRIANDO");
  };

  // ---------------- Etapa 15: payload ----------------
  const payload: Json = {
    reference_id: referenceId,
    customer: { name: clienteNome },
    items: pagbankItems,
    qr_codes: [
      {
        amount: { value: valorCentavos },
        expiration_date: expiraEm.toISOString(),
      },
    ],
    // notification_urls omitido de propósito: webhook ainda não existe.
  };

  // ---------------- Etapa 16: chamada externa ----------------
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pagbankToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-idempotency-key": chave,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const abortado = (e as Error)?.name === "AbortError";
    // Requisição pode ter chegado ao PagBank: registrar erro, manter registro
    // e a mesma chave de idempotência para retry/recuperação posterior.
    await supabase
      .from("reservas_checkout_pagbank")
      .update({
        erro_mensagem: sanitizarErro(
          abortado ? "PAGBANK_TIMEOUT" : "PAGBANK_NETWORK_ERROR",
        ),
      })
      .eq("reserva_id", reservaId)
      .eq("status", "CRIANDO");
    return erro(abortado ? "PAGBANK_TIMEOUT" : "PAGBANK_NETWORK_ERROR", 504);
  }
  clearTimeout(timer);

  let respJson: Json | null = null;
  try {
    respJson = await resp.json();
  } catch {
    respJson = null;
  }

  if (!resp.ok) {
    await supabase
      .from("reservas_checkout_pagbank")
      .update({
        erro_mensagem: sanitizarErro(
          `PAGBANK_HTTP_${resp.status}: ${JSON.stringify(respJson ?? {}).slice(0, 400)}`,
        ),
      })
      .eq("reserva_id", reservaId)
      .eq("status", "CRIANDO");
    return erro("PAGBANK_HTTP_ERROR", 502, { http_status: resp.status });
  }

  // ---------------- Etapa 17: validar e persistir resposta ----------------
  const orderId = respJson && typeof respJson.id === "string" ? respJson.id : null;
  const qrs = respJson?.qr_codes;
  const qr = Array.isArray(qrs) && qrs.length > 0 ? (qrs[0] as Json) : null;
  const qrText = qr && typeof qr.text === "string" ? qr.text : null;
  const qrId = qr && typeof qr.id === "string" ? qr.id : null;
  const qrValor = (qr?.amount as Json | undefined)?.value;
  const refRetornado = typeof respJson?.reference_id === "string"
    ? respJson.reference_id
    : null;

  const valorIncompativel =
    typeof qrValor === "number" && qrValor !== valorCentavos;
  const refIncompativel = refRetornado !== null && refRetornado !== referenceId;

  if (!orderId || !qr || !qrText || valorIncompativel || refIncompativel) {
    await marcarErro("RESPOSTA_PAGBANK_INVALIDA");
    return erro("RESPOSTA_PAGBANK_INVALIDA", 502);
  }

  const pngUrl = extrairLink(qr.links, "QRCODE.PNG");
  const base64Url = extrairLink(qr.links, "QRCODE.BASE64");

  const { error: eUpd } = await supabase
    .from("reservas_checkout_pagbank")
    .update({
      pagbank_order_id: orderId,
      pagbank_qr_code_id: qrId,
      qr_code_text: qrText,
      qr_code_png_url: pngUrl,
      qr_code_base64_url: base64Url,
      pagbank_status: typeof respJson?.status === "string" ? respJson.status : null,
      payload_criacao: sanitizarPayloadCriacao(payload),
      status: "ATIVA",
    })
    .eq("reserva_id", reservaId);

  if (eUpd) return erro("ERRO_BANCO", 500);

  return json({
    ok: true,
    reutilizada: false,
    reserva_id: reservaId,
    pagbank_order_id: orderId,
    qr_code_text: qrText,
    qr_code_png_url: pngUrl,
    qr_code_base64_url: base64Url,
    expira_em: reserva.expira_em,
    valor_centavos: valorCentavos,
  });
});

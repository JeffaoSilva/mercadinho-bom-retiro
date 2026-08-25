// TEMPORÁRIO: harness de teste do pagbank-webhook.
// Calcula a assinatura server-side (o token nunca sai da função) e chama o
// webhook. Retorna apenas status/código sanitizado. Deve ser removido após uso.

Deno.serve(async () => {
  const token = Deno.env.get("PAGBANK_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ erro: "PAGBANK_TOKEN_NAO_CONFIGURADO" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const url = `${base}/functions/v1/pagbank-webhook`;

  const sha = async (t: string) => {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const chamar = async (nome: string, body: string, assinatura: string | null, metodo = "POST") => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (assinatura) headers["x-authenticity-token"] = assinatura;
    const r = await fetch(url, { method: metodo, headers, body: metodo === "POST" ? body : undefined });
    let corpo: unknown = null;
    try { corpo = JSON.parse(await r.text()); } catch { corpo = "<nao-json>"; }
    return { teste: nome, http: r.status, corpo };
  };

  const bodyValido = JSON.stringify({
    id: "ORDE_INEXISTENTE-0000-0000-0000-000000000000",
    reference_id: "reserva_pix_999999",
    charges: [{ id: "CHAR_X", status: "PAID", amount: { value: 100, currency: "BRL" } }],
  });
  const bodyInvalido = "{ isso nao e json";

  const resultados = [
    await chamar("A_sem_assinatura", bodyValido, null),
    await chamar("B_assinatura_invalida", bodyValido, "0".repeat(64)),
    await chamar("C_json_invalido", bodyInvalido, await sha(`${token}-${bodyInvalido}`)),
    await chamar("D_order_desconhecido", bodyValido, await sha(`${token}-${bodyValido}`)),
    await chamar("E_metodo_get", "", null, "GET"),
  ];

  return new Response(JSON.stringify({ resultados }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});

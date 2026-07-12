import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BackButton from "@/components/BackButton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type ItemCompraV3 = {
  item_id: number;
  produto_id: number | null;
  produto: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
};

type CompraV3 = {
  compra_id: number;
  data_compra: string;
  data_compra_brasil: string;
  hora_compra_brasil: string;
  valor_total: number;
  itens: ItemCompraV3[];
};

type PagamentoV3 = {
  pagamento_id: number;
  data_pagamento: string;
  data_pagamento_brasil: string;
  hora_pagamento_brasil: string;
  valor: number;
  forma_pagamento: string | null;
  forma_pagamento_outro: string | null;
  observacao: string | null;
  origem: string | null;
  cancelado: boolean;
};

type MesV3 = {
  mes: string; // YYYY-MM
  total_compras: number;
  total_pagamentos: number;
  divida_mes: number;
  status: "quitado" | "parcial" | "em_aberto";
  compras: CompraV3[];
  pagamentos: PagamentoV3[];
};

type CadernetaV3Payload = {
  cliente_id: number;
  total_devido: number;
  meses: MesV3[];
};

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatBRL(v: number): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMesLabel(mes: string): string {
  const [ano, m] = mes.split("-");
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return mes;
  return `${MESES_PT[idx]} de ${ano}`;
}

function currentYYYYMM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMes(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function statusLabel(s: MesV3["status"]): { label: string; className: string } {
  switch (s) {
    case "quitado":
      return { label: "Quitado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" };
    case "parcial":
      return { label: "Parcial", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" };
    default:
      return { label: "Em aberto", className: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300" };
  }
}

function formaPagamentoLabel(p: PagamentoV3): string {
  if (!p.forma_pagamento) return "—";
  if (p.forma_pagamento === "outro" && p.forma_pagamento_outro) {
    return `Outro: ${p.forma_pagamento_outro}`;
  }
  return p.forma_pagamento.toUpperCase();
}

function origemLabel(origem: string | null): string {
  if (origem === "migracao_v2") return "Migração V2";
  if (origem === "manual_admin") return "Manual (Admin)";
  return origem || "—";
}

const AdminCadernetaV3 = () => {
  const { clienteId } = useParams<{ clienteId: string }>();
  const [payload, setPayload] = useState<CadernetaV3Payload | null>(null);
  const [nomeCliente, setNomeCliente] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [mesSelecionado, setMesSelecionado] = useState<string>(currentYYYYMM());

  useEffect(() => {
    if (!clienteId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: rpcData, error: rpcErr }, { data: cli }] = await Promise.all([
          (supabase.rpc as any)("cliente_caderneta_v3", { p_cliente_id: Number(clienteId) }),
          supabase.from("clientes").select("nome").eq("id", Number(clienteId)).maybeSingle(),
        ]);
        if (rpcErr) throw rpcErr;
        setPayload(rpcData as CadernetaV3Payload);
        setNomeCliente((cli as any)?.nome || "");
      } catch (e: any) {
        console.error(e);
        toast.error("Erro ao carregar caderneta V3");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clienteId]);

  const mesData: MesV3 = useMemo(() => {
    const found = payload?.meses.find((m) => m.mes === mesSelecionado);
    if (found) return found;
    return {
      mes: mesSelecionado,
      total_compras: 0,
      total_pagamentos: 0,
      divida_mes: 0,
      status: "quitado",
      compras: [],
      pagamentos: [],
    };
  }, [payload, mesSelecionado]);

  const st = statusLabel(mesData.status);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <BackButton to="/admin/cadernetas?dest=v3" />
          <h1 className="text-3xl font-bold">
            Caderneta V3 {nomeCliente ? `- ${nomeCliente}` : ""}
          </h1>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setMesSelecionado((m) => shiftMes(m, -1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Mês anterior
          </Button>
          <div className="text-xl font-semibold">{formatMesLabel(mesSelecionado)}</div>
          <Button
            variant="outline"
            onClick={() => setMesSelecionado((m) => shiftMes(m, 1))}
          >
            Próximo mês <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <>
            {/* Topo: cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className={`mt-1 inline-flex px-2 py-1 rounded text-sm font-semibold ${st.className}`}>
                    {st.label}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Total compras</div>
                  <div className="text-lg font-bold mt-1">{formatBRL(mesData.total_compras)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Total pagamentos</div>
                  <div className="text-lg font-bold mt-1 text-emerald-600">
                    {formatBRL(mesData.total_pagamentos)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Dívida do mês</div>
                  <div className="text-lg font-bold mt-1">{formatBRL(mesData.divida_mes)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Total devido</div>
                  <div className="text-lg font-bold mt-1 text-rose-600">
                    {formatBRL(payload?.total_devido || 0)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Compras */}
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Compras</h2>
              {mesData.compras.length === 0 ? (
                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    Nenhuma compra registrada.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {mesData.compras.map((c) => (
                    <Card key={c.compra_id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">
                            {c.data_compra_brasil} às {c.hora_compra_brasil}
                          </div>
                          <div className="font-bold">{formatBRL(c.valor_total)}</div>
                        </div>
                        {c.itens.length > 0 && (
                          <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                            {c.itens.map((i) => (
                              <li key={i.item_id} className="flex justify-between">
                                <span>
                                  {i.quantidade}x {i.produto ?? `Produto #${i.produto_id ?? "?"}`}
                                </span>
                                <span>{formatBRL(i.valor_total)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* Pagamentos */}
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Pagamentos</h2>
              {mesData.pagamentos.length === 0 ? (
                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    Nenhum pagamento registrado.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {mesData.pagamentos.map((p) => (
                    <Card
                      key={p.pagamento_id}
                      className={p.cancelado ? "opacity-60 border-dashed" : ""}
                    >
                      <CardContent className="p-4 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">
                            {p.data_pagamento_brasil} às {p.hora_pagamento_brasil}
                          </div>
                          <div
                            className={`font-bold ${
                              p.cancelado ? "line-through" : "text-emerald-600"
                            }`}
                          >
                            {formatBRL(p.valor)}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Forma: {formaPagamentoLabel(p)} · Origem: {origemLabel(p.origem)}
                        </div>
                        {p.observacao && (
                          <div className="text-sm">Obs: {p.observacao}</div>
                        )}
                        {p.cancelado && (
                          <div className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300">
                            Pagamento cancelado — não contabilizado
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminCadernetaV3;

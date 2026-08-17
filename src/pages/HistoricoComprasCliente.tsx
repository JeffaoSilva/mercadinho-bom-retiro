import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BackButton from "@/components/BackButton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCheckout } from "@/hooks/useCheckout";
import { FormaPagamentoBadge, formaPagamentoLabel } from "@/components/FormaPagamentoBadge";

type ItemHist = {
  item_id: number;
  produto_id: number;
  produto: string;
  quantidade: number;
  quantidade_estornada: number;
  quantidade_liquida: number;
  valor_unitario: number;
  subtotal_original: number;
  valor_estornado: number;
  subtotal_liquido: number;
};

type CompraHist = {
  compra_id: number;
  data_compra: string;
  data: string;
  hora: string;
  forma_pagamento: string | null;
  valor_total_original: number;
  valor_estornado: number;
  valor_liquido: number;
  status_estorno: "normal" | "parcial" | "estornado";
  itens: ItemHist[];
};

type ResumoForma = {
  forma_pagamento: string | null;
  total: number;
  quantidade: number;
};

type HistoricoPayload = {
  cliente_id: number;
  mes: string;
  total_compras: number;
  total_bruto: number;
  total_estornado: number;
  quantidade_compras: number;
  por_forma_pagamento: ResumoForma[];
  compras: CompraHist[];
};

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatMesLabel(mes: string): string {
  const [ano, m] = mes.split("-");
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return mes;
  return `${MESES_PT[idx]} de ${ano}`;
}

function formatBRL(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMes(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function HistoricoComprasCliente() {
  const params = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const checkout = useCheckout();

  const clienteIdRota = params.clienteId ? Number(params.clienteId) : null;
  const clienteId = checkout.clienteId || clienteIdRota;

  const [clienteNome, setClienteNome] = useState<string>(checkout.clienteNome || "");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [data, setData] = useState<HistoricoPayload | null>(null);
  const [mesSelecionado, setMesSelecionado] = useState<string>(currentMonthKey());

  useEffect(() => {
    if (!clienteId) navigate("/area-cliente");
  }, [clienteId, navigate]);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!clienteId) return;
      setLoading(true);
      setErro(null);
      try {
        const [rpcRes, cliRes] = await Promise.all([
          (supabase.rpc as any)("cliente_historico_mensal", {
            p_cliente_id: clienteId,
            p_mes: `${mesSelecionado}-01`,
          }),
          supabase.from("clientes_kiosk" as any).select("nome").eq("id", clienteId).maybeSingle(),
        ]);
        if (cancelado) return;
        if (rpcRes.error || !rpcRes.data) {
          setErro("Não foi possível carregar seu histórico.\nTente novamente.");
          setData(null);
        } else {
          setData(rpcRes.data as HistoricoPayload);
        }
        const nome = (cliRes.data as any)?.nome;
        if (nome) setClienteNome(nome);
      } catch {
        if (!cancelado) {
          setErro("Não foi possível carregar seu histórico.\nTente novamente.");
          setData(null);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [clienteId, mesSelecionado]);

  const compras = data?.compras ?? [];

  const resumoFormas = useMemo(
    () => (data?.por_forma_pagamento ?? []).slice().sort((a, b) => b.total - a.total),
    [data]
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <BackButton to={clienteId ? `/area-cliente/${clienteId}` : "/area-cliente"} />
      <div className="max-w-5xl mx-auto pt-6 space-y-6">
        <h1 className="text-3xl font-bold text-center">Histórico de compras</h1>
        {clienteNome && (
          <p className="text-center text-lg text-muted-foreground -mt-4">{clienteNome}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" onClick={() => setMesSelecionado((m) => shiftMes(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Mês anterior</span>
          </Button>
          <div className="flex-1 text-center text-lg font-semibold">
            {formatMesLabel(mesSelecionado)}
          </div>
          <Button variant="outline" onClick={() => setMesSelecionado((m) => shiftMes(m, 1))}>
            <span className="hidden sm:inline">Próximo mês</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {erro && (
          <Card>
            <CardContent className="p-6 text-center text-destructive whitespace-pre-line">
              {erro}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Resumo do mês */}
            <Card>
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total de compras no mês</span>
                  <span className="text-xl font-bold">{formatBRL(data?.total_compras ?? 0)}</span>
                </div>
                {resumoFormas.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {resumoFormas.map((f) => (
                      <div
                        key={f.forma_pagamento ?? "sem_forma"}
                        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {formaPagamentoLabel(f.forma_pagamento)}
                        </span>
                        <span className="font-semibold">{formatBRL(f.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {compras.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-6">
                Nenhuma compra neste mês.
              </div>
            ) : (
              <section className="flex flex-col gap-3">
                {compras.map((c) => (
                  <Card
                    key={c.compra_id}
                    className={`rounded-2xl ${c.status_estorno === "estornado" ? "opacity-80 border-destructive/40" : ""}`}
                  >
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm">
                          {c.data} {c.hora}
                        </div>
                        <div className="flex items-center gap-2">
                          <FormaPagamentoBadge forma={c.forma_pagamento} />
                          {c.status_estorno === "estornado" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-destructive/10 text-destructive">
                              Estornado
                            </span>
                          )}
                          {c.status_estorno === "parcial" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                              Parcialmente estornado
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 mt-1">
                        {(c.itens || []).map((it) => (
                          <div key={it.item_id} className="text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={
                                  it.quantidade_liquida === 0 && it.quantidade_estornada > 0
                                    ? "line-through text-muted-foreground"
                                    : ""
                                }
                              >
                                {it.quantidade}x {it.produto}
                              </span>
                              <span className="font-medium">
                                {formatBRL(Number(it.subtotal_original))}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatBRL(Number(it.valor_unitario))} cada
                              {Number(it.quantidade_estornada) > 0 && (
                                <> · {it.quantidade_estornada} estornado(s) · −{formatBRL(Number(it.valor_estornado))}</>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="border-t pt-2 mt-1 flex flex-col gap-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Total da compra</span>
                          <span className="font-semibold">
                            {formatBRL(Number(c.valor_total_original))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Forma de pagamento</span>
                          <span>{formaPagamentoLabel(c.forma_pagamento)}</span>
                        </div>
                        {Number(c.valor_estornado) > 0 && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Valor estornado</span>
                              <span className="text-destructive font-medium">
                                −{formatBRL(Number(c.valor_estornado))}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Valor final da compra</span>
                              <span className="font-bold">{formatBRL(Number(c.valor_liquido))}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

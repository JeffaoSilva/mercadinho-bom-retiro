import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BackButton from "@/components/BackButton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCheckout } from "@/hooks/useCheckout";

type ItemV3 = {
  item_id: number;
  produto_id: number;
  produto: string;
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
  itens: ItemV3[];
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
  mes: string;
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

function statusLabel(s: MesV3["status"]): { label: string; icon: string } {
  switch (s) {
    case "quitado":
      return { label: "Quitado", icon: "✅" };
    case "parcial":
      return { label: "Parcial", icon: "🟡" };
    default:
      return { label: "Em aberto", icon: "🔴" };
  }
}

function formaPagamentoLabel(p: PagamentoV3): string {
  if (!p.forma_pagamento) return "—";
  if (p.forma_pagamento === "outro" && p.forma_pagamento_outro) {
    return `Outro: ${p.forma_pagamento_outro}`;
  }
  return p.forma_pagamento.toUpperCase();
}

const EMPTY_MES = (mes: string): MesV3 => ({
  mes,
  total_compras: 0,
  total_pagamentos: 0,
  divida_mes: 0,
  status: "quitado",
  compras: [],
  pagamentos: [],
});

export default function AreaClienteV3() {
  const params = useParams<{ clienteId: string }>();
  const navigate = useNavigate();
  const checkout = useCheckout();

  const clienteIdRota = params.clienteId ? Number(params.clienteId) : null;
  const clienteId = checkout.clienteId || clienteIdRota;

  const [clienteNome, setClienteNome] = useState<string>(checkout.clienteNome || "");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [data, setData] = useState<CadernetaV3Payload | null>(null);
  const [mesSelecionado, setMesSelecionado] = useState<string>(currentMonthKey());

  useEffect(() => {
    if (!clienteId) {
      navigate("/area-cliente");
    }
  }, [clienteId, navigate]);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!clienteId) return;
      setLoading(true);
      setErro(null);
      try {
        const [rpcRes, cliRes] = await Promise.all([
          (supabase.rpc as any)("cliente_caderneta_v3", { p_cliente_id: clienteId }),
          supabase.from("clientes_kiosk").select("nome").eq("id", clienteId).maybeSingle(),
        ]);
        if (cancelado) return;
        if (rpcRes.error || !rpcRes.data) {
          setErro("Não foi possível carregar sua caderneta.\nTente novamente.");
          setData(null);
        } else {
          setData(rpcRes.data as CadernetaV3Payload);
        }
        if (cliRes.data?.nome) setClienteNome(cliRes.data.nome);
      } catch {
        if (!cancelado) {
          setErro("Não foi possível carregar sua caderneta.\nTente novamente.");
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
  }, [clienteId]);

  const mesData: MesV3 = useMemo(() => {
    if (!data) return EMPTY_MES(mesSelecionado);
    return data.meses?.find((m) => m.mes === mesSelecionado) ?? EMPTY_MES(mesSelecionado);
  }, [data, mesSelecionado]);

  const pagamentosValidos = useMemo(
    () => (mesData.pagamentos || []).filter((p) => !p.cancelado),
    [mesData]
  );

  const migrados = useMemo(
    () => pagamentosValidos.filter((p) => p.origem === "migracao_v2"),
    [pagamentosValidos]
  );
  const totalMigrado = useMemo(
    () => migrados.reduce((acc, p) => acc + Number(p.valor || 0), 0),
    [migrados]
  );
  const pagamentosVisiveis = useMemo(
    () => pagamentosValidos.filter((p) => p.origem !== "migracao_v2"),
    [pagamentosValidos]
  );

  const st = statusLabel(mesData.status);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <BackButton to="/" />
      <div className="max-w-5xl mx-auto pt-6 space-y-6">
        <h1 className="text-3xl font-bold text-center">
          {clienteNome ? `Área do Cliente - ${clienteNome}` : "Área do Cliente"}
        </h1>

        <div className="flex justify-center">
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate(`/area-cliente/${clienteId}/historico`)}
          >
            Histórico de compras
          </Button>
        </div>


        {/* Navegação entre meses */}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CardValor titulo="Total de compras" valor={formatBRL(mesData.total_compras)} legenda="No mês selecionado" />
              <CardValor titulo="Total de pagamentos" valor={formatBRL(mesData.total_pagamentos)} legenda="No mês selecionado" />
              <CardValor titulo="Dívida do mês" valor={formatBRL(mesData.divida_mes)} legenda="Restante a pagar no mês" />
              <CardValor titulo="Total devido" valor={formatBRL(data?.total_devido ?? 0)} legenda="Saldo devedor atual" />
            </div>

            <Card>
              <CardContent className="p-4 flex items-center justify-center gap-3 text-lg font-medium">
                <span className="text-2xl">{st.icon}</span>
                <span>{st.label}</span>
              </CardContent>
            </Card>

            {/* Compras */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">Compras</h2>
              {mesData.compras.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-4">
                  Nenhuma compra neste mês.
                </div>
              ) : (
                mesData.compras.map((compra) => (
                  <Card key={compra.compra_id} className="rounded-2xl">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm">
                          {compra.data_compra_brasil} {compra.hora_compra_brasil}
                        </div>
                        <div className="font-semibold text-sm">
                          {formatBRL(Number(compra.valor_total))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 mt-1">
                        {(compra.itens || []).map((it) => (
                          <div key={it.item_id} className="flex items-center justify-between text-sm">
                            <div className="flex-1">{it.produto}</div>
                            <div className="text-muted-foreground text-xs mx-2">
                              {it.quantidade}x {formatBRL(Number(it.valor_unitario))}
                            </div>
                            <div className="font-medium">{formatBRL(Number(it.valor_total))}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>

            {/* Pagamentos */}
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">Pagamentos</h2>

              {totalMigrado > 0 && (
                <Card className="rounded-2xl border-emerald-200">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="text-sm font-medium">Valores já pagos anteriormente</div>
                    <div className="font-semibold text-sm">{formatBRL(totalMigrado)}</div>
                  </CardContent>
                </Card>
              )}

              {pagamentosVisiveis.length === 0 && totalMigrado === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-4">
                  Nenhum pagamento neste mês.
                </div>
              ) : (
                pagamentosVisiveis.map((p) => (
                  <Card key={p.pagamento_id} className="rounded-2xl">
                    <CardContent className="p-4 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm">
                          {p.data_pagamento_brasil} {p.hora_pagamento_brasil}
                        </div>
                        <div className="font-semibold text-sm">{formatBRL(Number(p.valor))}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formaPagamentoLabel(p)}
                      </div>
                      {p.observacao && (
                        <div className="text-xs text-muted-foreground">{p.observacao}</div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function CardValor({
  titulo,
  valor,
  legenda,
}: {
  titulo: string;
  valor: string;
  legenda: string;
}) {
  return (
    <Card className="h-full">
      <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
        <div className="text-sm text-muted-foreground">{titulo}</div>
        <div className="text-xl font-bold mt-1">{valor}</div>
        <div className="text-xs text-muted-foreground mt-1">{legenda}</div>
      </CardContent>
    </Card>
  );
}

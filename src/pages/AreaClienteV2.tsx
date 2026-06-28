import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import BackButton from "@/components/BackButton";
import { PaymentBadge } from "@/components/PaymentBadge";
import { ChevronLeft, ChevronRight } from "lucide-react";


type ItemCompraV2 = {
  item_compra_id: number;
  produto_id: number;
  nome_produto: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
};

type CompraV2 = {
  compra_id: number;
  data_compra: string;
  data_compra_brasil: string;
  hora_compra_brasil: string;
  valor_total: number;
  forma_pagamento: string;
  paga: boolean;
  itens: ItemCompraV2[];
};

type DistribuicaoAbat = {
  mes: string;
  mes_formatado: string;
  valor_aplicado: number;
};

type AbatimentoAplicado = {
  abatimento_id: number;
  data_lancamento: string;
  data_lancamento_brasil: string;
  hora_lancamento_brasil: string;
  valor_lancado: number;
  valor_aplicado_no_mes_visualizado: number;
  distribuicao: DistribuicaoAbat[];
};

type AbatimentoLancado = {
  abatimento_id: number;
  data_lancamento: string;
  data_lancamento_brasil: string;
  hora_lancamento_brasil: string;
  valor_lancado: number;
  distribuicao: DistribuicaoAbat[];
};

type MesData = {
  mes: string;
  total_caderneta: number;
  total_pix: number;
  abatimento_aplicado_mes: number;
  movimentacao_mes: number;
  saldo_mes: number;
  percentual_caderneta_grafico: number;
  percentual_pix_grafico: number;
  status_mes: string;
  compras: CompraV2[];
  abatimentos_aplicados_no_mes: AbatimentoAplicado[];
  abatimentos_lancados_no_mes: AbatimentoLancado[];
};


type CadernetaPayload = {
  cliente_id: number;
  total_devido_atual: number;
  saldo_positivo_atual: number;
  total_pix_historico: number;
  meses: MesData[];
};

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const COR_CADERNETA = "hsl(270 70% 50%)";
const COR_PIX = "hsl(142 71% 45%)";
const COR_VAZIO = "hsl(var(--muted))";

function formatMesLabel(mes: string): string {
  const [ano, m] = mes.split("-");
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return mes;
  return `${MESES_PT[idx]} de ${ano}`;
}

function formatBRL(value: number): string {
  return (value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonth(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const EMPTY_MES = (mes: string): MesData => ({
  mes,
  total_caderneta: 0,
  total_pix: 0,
  abatimento_aplicado_mes: 0,
  movimentacao_mes: 0,
  saldo_mes: 0,
  percentual_caderneta_grafico: 0,
  percentual_pix_grafico: 0,
  status_mes: "sem_movimentacao",
  compras: [],
  abatimentos_detalhados: [],
});


const STATUS_MAP: Record<string, { label: string; icon: string }> = {
  quitado: { label: "Quitado", icon: "✅" },
  parcial: { label: "Parcialmente pago", icon: "🟡" },
  em_aberto: { label: "Em aberto", icon: "🔴" },
  quitado_pix: { label: "Sem dívida no mês", icon: "🔵" },
  sem_movimentacao: { label: "Sem movimentação", icon: "⚪" },
};

export default function AreaClienteV2() {
  const params = useParams<{ clienteId: string }>();
  const clienteId = params.clienteId ? Number(params.clienteId) : null;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [data, setData] = useState<CadernetaPayload | null>(null);
  const [mesSelecionado, setMesSelecionado] = useState<string>(currentMonthKey());
  const [showAbatModal, setShowAbatModal] = useState(false);


  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!clienteId) {
        setErro("Cliente inválido.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setErro(null);
      try {
        const { data: rpcData, error } = await (supabase.rpc as any)("cliente_caderneta_v2", {
          p_cliente_id: clienteId,
        });
        if (cancelado) return;
        if (error || !rpcData) {
          setErro("Não foi possível carregar sua caderneta.\nTente novamente.");
          setData(null);
        } else {
          setData(rpcData as CadernetaPayload);
        }
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

  const mesAtualKey = currentMonthKey();

  const mesData: MesData = useMemo(() => {
    if (!data) return EMPTY_MES(mesSelecionado);
    const found = data.meses?.find((m) => m.mes === mesSelecionado);
    return found ?? EMPTY_MES(mesSelecionado);
  }, [data, mesSelecionado]);

  const primeiroMes = useMemo(() => {
    if (!data?.meses?.length) return null;
    return data.meses.map((m) => m.mes).sort()[0];
  }, [data]);

  const proximoNoFuturo = useMemo(() => {
    return addMonth(mesSelecionado, 1) > mesAtualKey;
  }, [mesSelecionado, mesAtualKey]);

  const chartData = [
    { name: "Caderneta", value: mesData.total_caderneta },
    { name: "PIX", value: mesData.total_pix },
  ];
  const chartColors = [COR_CADERNETA, COR_PIX];
  const movimentacaoTotal = mesData.movimentacao_mes;
  const status = STATUS_MAP[mesData.status_mes] ?? STATUS_MAP.sem_movimentacao;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <BackButton />
      <div className="max-w-5xl mx-auto pt-6 space-y-6">
        <h1 className="text-3xl font-bold text-center">Caderneta V2</h1>

        {/* Navegação entre meses */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => setMesSelecionado((m) => addMonth(m, -1))}
            disabled={loading || mesSelecionado === primeiroMes}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Mês anterior</span>
          </Button>
          <div className="flex-1 text-center text-lg font-semibold">
            {formatMesLabel(mesSelecionado)}
          </div>
          <Button
            variant="outline"
            onClick={() => setMesSelecionado((m) => addMonth(m, 1))}
            disabled={loading || proximoNoFuturo}
          >
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

        {/* Cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <CardValor
              titulo="Caderneta"
              valor={formatBRL(mesData.total_caderneta)}
              legenda="No mês selecionado"
            />
            <CardValor
              titulo="Abatimentos"
              valor={formatBRL(mesData.abatimento_aplicado_mes)}
              legenda="No mês selecionado"
              onClick={() => setShowAbatModal(true)}

            />
            <CardValor
              titulo="PIX"
              valor={formatBRL(mesData.total_pix)}
              legenda="No mês selecionado"
            />
            <CardValor
              titulo="Total devido"
              valor={formatBRL(data?.total_devido_atual ?? 0)}
              legenda="Saldo devedor atual (todos os meses)"
            />
          </div>
        )}

        {/* Gráfico Donut */}
        <Card>
          <CardContent className="p-6">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={
                          movimentacaoTotal > 0
                            ? chartData
                            : [{ name: "Vazio", value: 1 }]
                        }
                        dataKey="value"
                        innerRadius={70}
                        outerRadius={100}
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                      >
                        {(movimentacaoTotal > 0 ? chartData : [{ name: "Vazio", value: 1 }]).map((_, i) => (
                          <Cell
                            key={i}
                            fill={
                              movimentacaoTotal > 0
                                ? chartColors[i]
                                : COR_VAZIO
                            }
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex flex-col justify-center h-full gap-6">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Movimentação do mês
                    </div>
                    <div className="text-2xl font-bold">
                      {formatBRL(movimentacaoTotal)}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-sm"
                          style={{ background: COR_CADERNETA }}
                        />
                        <span>Caderneta</span>
                      </div>
                      <span className="font-semibold">
                        {formatBRL(mesData.total_caderneta)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-sm"
                          style={{ background: COR_PIX }}
                        />
                        <span>PIX</span>
                      </div>
                      <span className="font-semibold">
                        {formatBRL(mesData.total_pix)}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Caderneta {mesData.percentual_caderneta_grafico}% · PIX{" "}
                    {mesData.percentual_pix_grafico}%
                  </div>
                </div>
              </div>
            )}

            {!loading && (
              <p className="text-xs text-muted-foreground text-center mt-6">
                As compras no PIX não entram no cálculo da dívida, mas são
                exibidas para seu controle.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Status */}
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <Card>
            <CardContent className="p-4 flex items-center justify-center gap-3 text-lg font-medium">
              <span className="text-2xl">{status.icon}</span>
              <span>{status.label}</span>
            </CardContent>
          </Card>
        )}

        {/* Histórico de compras do mês selecionado */}
        {!loading && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Compras do mês</h2>
            {mesData.compras.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-4">
                Nenhuma compra neste mês.
              </div>
            ) : (
              mesData.compras.map((compra, index) => (
                <div key={compra.compra_id}>
                  <Card className="rounded-2xl">
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-sm">
                            {compra.data_compra_brasil} {compra.hora_compra_brasil}
                          </div>
                          <PaymentBadge formaPagamento={compra.forma_pagamento} />
                        </div>
                        <div className="font-semibold text-sm">
                          {formatBRL(Number(compra.valor_total))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 mt-1">
                        {compra.itens.map((it) => (
                          <div
                            key={it.item_compra_id}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex-1">{it.nome_produto}</div>
                            <div className="text-muted-foreground text-xs mx-2">
                              {it.quantidade}x {formatBRL(Number(it.valor_unitario))}
                            </div>
                            <div className="font-medium">
                              {formatBRL(Number(it.valor_total))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  {index < mesData.compras.length - 1 && <div className="h-2" />}
                </div>
              ))
            )}
          </section>
        )}
      </div>

      <AbatimentosModal
        open={showAbatModal}
        onOpenChange={setShowAbatModal}
        mesLabel={formatMesLabel(mesSelecionado)}
        abatimentos={mesData.abatimentos_detalhados}
      />
    </div>
  );
}

function AbatimentosModal({
  open,
  onOpenChange,
  mesLabel,
  abatimentos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mesLabel: string;
  abatimentos: AbatimentoDetalhado[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abatimentos — {mesLabel}</DialogTitle>
          <DialogDescription>
            Pagamentos que reduziram a dívida deste mês e como foram distribuídos.
          </DialogDescription>
        </DialogHeader>

        {abatimentos.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-4">
            Nenhum abatimento encontrado para este mês.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {abatimentos.map((a) => (
              <Card key={a.abatimento_id} className="rounded-xl">
                <CardContent className="p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      {a.data_lancamento_brasil} {a.hora_lancamento_brasil}
                    </div>
                    <div className="text-sm font-semibold">
                      {(a.valor_lancado ?? 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Aplicado neste mês:{" "}
                    <span className="font-semibold text-foreground">
                      {(a.valor_aplicado_no_mes_visualizado ?? 0).toLocaleString(
                        "pt-BR",
                        { style: "currency", currency: "BRL" }
                      )}
                    </span>
                  </div>
                  {a.distribuicao && a.distribuicao.length > 0 && (
                    <div className="mt-1 border-t pt-2">
                      <div className="text-xs font-medium mb-1">Distribuição:</div>
                      <div className="flex flex-col gap-1">
                        {a.distribuicao.map((d) => (
                          <div
                            key={d.mes}
                            className="flex items-center justify-between text-xs"
                          >
                            <span>{d.mes_formatado}</span>
                            <span className="font-medium">
                              {(d.valor_aplicado ?? 0).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


function CardValor({
  titulo,
  valor,
  legenda,
  onClick,
}: {
  titulo: string;
  valor: string;
  legenda: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`h-full ${onClick ? "cursor-pointer hover:bg-accent transition-colors" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
        <div className="text-sm text-muted-foreground">{titulo}</div>
        <div className="text-xl font-bold mt-1">{valor}</div>
        <div className="text-xs text-muted-foreground mt-1">{legenda}</div>
      </CardContent>
    </Card>
  );

}

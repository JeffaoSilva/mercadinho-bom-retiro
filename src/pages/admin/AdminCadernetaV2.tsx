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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import BackButton from "@/components/BackButton";
import { PaymentBadge } from "@/components/PaymentBadge";
import { MoneyInput } from "@/components/MoneyInput";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  MinusCircle,
  Printer,
  Loader2,
} from "lucide-react";

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
  abatimentos_aplicados_no_mes: [],
  abatimentos_lancados_no_mes: [],
});


const STATUS_MAP: Record<string, { label: string; icon: string }> = {
  quitado: { label: "Quitado", icon: "✅" },
  parcial: { label: "Parcialmente pago", icon: "🟡" },
  em_aberto: { label: "Em aberto", icon: "🔴" },
  quitado_pix: { label: "Sem dívida no mês", icon: "🔵" },
  sem_movimentacao: { label: "Sem movimentação", icon: "⚪" },
};

export default function AdminCadernetaV2() {
  const params = useParams<{ clienteId: string }>();
  const clienteId = params.clienteId ? Number(params.clienteId) : null;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [data, setData] = useState<CadernetaPayload | null>(null);
  const [clienteNome, setClienteNome] = useState<string>("");
  const [mesSelecionado, setMesSelecionado] = useState<string>(currentMonthKey());

  // Abatimento modal
  const [showAbatimento, setShowAbatimento] = useState(false);
  const [abatimentoValor, setAbatimentoValor] = useState(0);
  const [salvandoAbatimento, setSalvandoAbatimento] = useState(false);
  const [showAbatDetalheModal, setShowAbatDetalheModal] = useState(false);


  // Exportar modal
  const [showExport, setShowExport] = useState(false);
  const [exportMesInicio, setExportMesInicio] = useState(currentMonthKey());
  const [exportMesFim, setExportMesFim] = useState(currentMonthKey());
  const [exportTipo, setExportTipo] = useState<"todas" | "caderneta" | "pix">("todas");

  async function carregar() {
    if (!clienteId) {
      setErro("Cliente inválido.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro(null);
    try {
      const [rpcRes, cliRes] = await Promise.all([
        (supabase.rpc as any)("cliente_caderneta_v2", { p_cliente_id: clienteId }),
        supabase.from("clientes").select("nome").eq("id", clienteId).single(),
      ]);
      if (rpcRes.error || !rpcRes.data) {
        setErro("Não foi possível carregar a caderneta.");
        setData(null);
      } else {
        setData(rpcRes.data as CadernetaPayload);
      }
      setClienteNome((cliRes.data as any)?.nome ?? "");
    } catch {
      setErro("Não foi possível carregar a caderneta.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const mesAtualKey = currentMonthKey();

  const mesData: MesData = useMemo(() => {
    if (!data) return EMPTY_MES(mesSelecionado);
    return data.meses?.find((m) => m.mes === mesSelecionado) ?? EMPTY_MES(mesSelecionado);
  }, [data, mesSelecionado]);

  const primeiroMes = useMemo(() => {
    if (!data?.meses?.length) return null;
    return data.meses.map((m) => m.mes).sort()[0];
  }, [data]);

  const proximoNoFuturo = useMemo(
    () => addMonth(mesSelecionado, 1) > mesAtualKey,
    [mesSelecionado, mesAtualKey]
  );

  const chartData = [
    { name: "Caderneta", value: mesData.total_caderneta },
    { name: "PIX", value: mesData.total_pix },
  ];
  const chartColors = [COR_CADERNETA, COR_PIX];
  const movimentacaoTotal = mesData.movimentacao_mes;
  const status = STATUS_MAP[mesData.status_mes] ?? STATUS_MAP.sem_movimentacao;

  const salvarAbatimento = async () => {
    if (!clienteId || abatimentoValor <= 0) return;
    setSalvandoAbatimento(true);
    const { error } = await supabase.from("abatimentos" as any).insert({
      cliente_id: clienteId,
      valor: abatimentoValor,
    } as any);
    setSalvandoAbatimento(false);
    if (error) {
      toast.error("Erro ao registrar abatimento");
      return;
    }
    toast.success("Abatimento registrado");
    setShowAbatimento(false);
    setAbatimentoValor(0);
    await carregar();
  };

  // === Exportação ===
  const mesesDisponiveis = useMemo(() => {
    return (data?.meses ?? []).map((m) => m.mes).sort();
  }, [data]);

  const relatorio = useMemo(() => {
    if (!data) return null;
    const ini = exportMesInicio;
    const fim = exportMesFim;
    const meses = (data.meses ?? []).filter((m) => m.mes >= ini && m.mes <= fim);
    let totalCad = 0;
    let totalPix = 0;
    let totalAbat = 0;
    const compras: (CompraV2 & { mes: string })[] = [];
    for (const m of meses) {
      totalCad += Number(m.total_caderneta || 0);
      totalPix += Number(m.total_pix || 0);
      totalAbat += Number(m.abatimento_aplicado_mes || 0);
      for (const c of m.compras || []) {
        if (
          exportTipo === "todas" ||
          (exportTipo === "caderneta" && c.forma_pagamento === "caderneta") ||
          (exportTipo === "pix" && c.forma_pagamento === "pix")
        ) {
          compras.push({ ...c, mes: m.mes });
        }
      }
    }
    return { totalCad, totalPix, totalAbat, compras };
  }, [data, exportMesInicio, exportMesFim, exportTipo]);

  const handlePrint = () => {
    setTimeout(() => window.print(), 100);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      {/* Estilos de impressão: esconde tudo, mostra apenas #area-impressao */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #area-impressao, #area-impressao * { visibility: visible !important; }
          #area-impressao {
            position: absolute; left: 0; top: 0; width: 100%;
            padding: 16px; background: white; color: black;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print">
        <BackButton to="/admin/cadernetas" />
      </div>

      <div className="max-w-5xl mx-auto pt-6 space-y-6 no-print">
        <div className="flex flex-col gap-1 items-center text-center">
          <h1 className="text-3xl font-bold">{clienteNome || "Cliente"}</h1>
          <p className="text-sm text-muted-foreground">Caderneta V2 — visão admin</p>
        </div>

        {/* Total devido em destaque */}
        <Card>
          <CardContent className="p-4 flex flex-col items-center text-center">
            <span className="text-sm text-muted-foreground">Total devido atual</span>
            <span className="text-3xl font-bold">
              {formatBRL(data?.total_devido_atual ?? 0)}
            </span>
            {data && data.saldo_positivo_atual > 0 && (
              <span className="text-sm text-emerald-600 mt-1">
                Saldo positivo: {formatBRL(data.saldo_positivo_atual)}
              </span>
            )}
          </CardContent>
        </Card>

        {/* Ações */}
        <div className="flex flex-wrap gap-2 justify-center">
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => {
              setAbatimentoValor(0);
              setShowAbatimento(true);
            }}
          >
            <MinusCircle className="h-4 w-4 mr-2" />
            Lançar abatimento
          </Button>
          <Button variant="outline" onClick={() => setShowExport(true)}>
            <Printer className="h-4 w-4 mr-2" />
            Exportar relatório
          </Button>
        </div>

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
            <CardValor titulo="Caderneta" valor={formatBRL(mesData.total_caderneta)} legenda="No mês" />
            <CardValor titulo="Abatimentos" valor={formatBRL(mesData.abatimento_aplicado_mes)} legenda="No mês" onClick={() => setShowAbatDetalheModal(true)} />
            <CardValor titulo="PIX" valor={formatBRL(mesData.total_pix)} legenda="No mês" />
            <CardValor titulo="Total devido" valor={formatBRL(data?.total_devido_atual ?? 0)} legenda="Saldo geral" />
          </div>
        )}

        {/* Gráfico */}
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
                        data={movimentacaoTotal > 0 ? chartData : [{ name: "Vazio", value: 1 }]}
                        dataKey="value"
                        innerRadius={70}
                        outerRadius={100}
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                      >
                        {(movimentacaoTotal > 0 ? chartData : [{ name: "Vazio", value: 1 }]).map((_, i) => (
                          <Cell key={i} fill={movimentacaoTotal > 0 ? chartColors[i] : COR_VAZIO} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Movimentação do mês</div>
                    <div className="text-2xl font-bold">{formatBRL(movimentacaoTotal)}</div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COR_CADERNETA }} />
                      <span>Caderneta</span>
                    </div>
                    <span className="font-semibold">{formatBRL(mesData.total_caderneta)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COR_PIX }} />
                      <span>PIX</span>
                    </div>
                    <span className="font-semibold">{formatBRL(mesData.total_pix)}</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-base font-medium pt-2 border-t">
                    <span className="text-xl">{status.icon}</span>
                    <span>{status.label}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histórico do mês */}
        {!loading && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Compras de {formatMesLabel(mesSelecionado)}</h2>
            {mesData.compras.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-4">
                Nenhuma compra neste mês.
              </div>
            ) : (
              mesData.compras.map((compra) => (
                <Card key={compra.compra_id} className="rounded-2xl">
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
                          <div className="font-medium">{formatBRL(Number(it.valor_total))}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>
        )}
      </div>

      {/* Área de impressão (oculta na tela, visível no print) */}
      {relatorio && (
        <div id="area-impressao" className="hidden print:block">
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            Relatório — {clienteNome}
          </h1>
          <p style={{ marginBottom: 4 }}>
            Período: <strong>{formatMesLabel(exportMesInicio)}</strong> até{" "}
            <strong>{formatMesLabel(exportMesFim)}</strong>
          </p>
          <p style={{ marginBottom: 12 }}>
            Filtro: <strong>{exportTipo}</strong>
          </p>

          <table style={{ width: "100%", marginBottom: 16, borderCollapse: "collapse" }}>
            <tbody>
              <tr><td>Total caderneta</td><td style={{ textAlign: "right" }}>{formatBRL(relatorio.totalCad)}</td></tr>
              <tr><td>Total PIX</td><td style={{ textAlign: "right" }}>{formatBRL(relatorio.totalPix)}</td></tr>
              <tr><td>Abatimentos aplicados</td><td style={{ textAlign: "right" }}>{formatBRL(relatorio.totalAbat)}</td></tr>
              <tr><td><strong>Total devido atual</strong></td><td style={{ textAlign: "right" }}><strong>{formatBRL(data?.total_devido_atual ?? 0)}</strong></td></tr>
            </tbody>
          </table>

          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Compras</h2>
          {relatorio.compras.length === 0 ? (
            <p>Nenhuma compra no período/filtro.</p>
          ) : (
            relatorio.compras.map((c) => (
              <div key={c.compra_id} style={{ borderTop: "1px solid #ccc", padding: "8px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                  <span>{c.data_compra_brasil} {c.hora_compra_brasil} — {c.forma_pagamento}</span>
                  <span>{formatBRL(Number(c.valor_total))}</span>
                </div>
                <ul style={{ marginLeft: 16, marginTop: 4 }}>
                  {c.itens.map((it) => (
                    <li key={it.item_compra_id} style={{ fontSize: 13 }}>
                      {it.quantidade}x {it.nome_produto} — {formatBRL(Number(it.valor_total))}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal Abatimento */}
      <Dialog open={showAbatimento} onOpenChange={setShowAbatimento}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar abatimento</DialogTitle>
            <DialogDescription>
              Valor a abater da dívida de <strong>{clienteNome}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <MoneyInput value={abatimentoValor} onChange={setAbatimentoValor} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAbatimento(false)} disabled={salvandoAbatimento}>
              Cancelar
            </Button>
            <Button
              onClick={salvarAbatimento}
              disabled={salvandoAbatimento || abatimentoValor <= 0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {salvandoAbatimento && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Exportar */}
      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar relatório</DialogTitle>
            <DialogDescription>
              Selecione o período e o tipo de compra. A impressão usa a janela do navegador.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mês inicial</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={exportMesInicio}
                onChange={(e) => setExportMesInicio(e.target.value)}
              >
                {mesesDisponiveis.map((m) => (
                  <option key={m} value={m}>{formatMesLabel(m)}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Mês final</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={exportMesFim}
                onChange={(e) => setExportMesFim(e.target.value)}
              >
                {mesesDisponiveis.map((m) => (
                  <option key={m} value={m}>{formatMesLabel(m)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Tipo de compra</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={exportTipo}
              onChange={(e) => setExportTipo(e.target.value as any)}
            >
              <option value="todas">Todas</option>
              <option value="caderneta">Caderneta</option>
              <option value="pix">PIX</option>
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExport(false)}>Fechar</Button>
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de detalhe de Abatimentos */}
      <Dialog open={showAbatDetalheModal} onOpenChange={setShowAbatDetalheModal}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Abatimentos — {formatMesLabel(mesSelecionado)}</DialogTitle>
            <DialogDescription>
              Pagamentos que reduziram a dívida deste mês e como foram distribuídos.
            </DialogDescription>
          </DialogHeader>

          {mesData.abatimentos_detalhados.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-4">
              Nenhum abatimento encontrado para este mês.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {mesData.abatimentos_detalhados.map((a) => (
                <Card key={a.abatimento_id} className="rounded-xl">
                  <CardContent className="p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">
                        {a.data_lancamento_brasil} {a.hora_lancamento_brasil}
                      </div>
                      <div className="text-sm font-semibold">
                        {formatBRL(Number(a.valor_lancado))}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Aplicado neste mês:{" "}
                      <span className="font-semibold text-foreground">
                        {formatBRL(Number(a.valor_aplicado_no_mes_visualizado))}
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
                                {formatBRL(Number(d.valor_aplicado))}
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
    </div>
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


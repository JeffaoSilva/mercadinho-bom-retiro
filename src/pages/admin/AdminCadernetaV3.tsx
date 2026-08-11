import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/MoneyInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BackButton from "@/components/BackButton";
import { ChevronLeft, ChevronRight, Loader2, Plus, Printer } from "lucide-react";
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

  const [modalAberto, setModalAberto] = useState(false);
  const [valor, setValor] = useState<number | null>(null);
  const [forma, setForma] = useState<string>("");
  const [formaOutro, setFormaOutro] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(async (showLoading = true) => {
    if (!clienteId) return;
    if (showLoading) setLoading(true);
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
      if (showLoading) setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => {
    load();
  }, [load]);

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

  // ===== Exportar relatório (PDF via impressão) =====
  const [showExport, setShowExport] = useState(false);
  const [exportMesInicio, setExportMesInicio] = useState<string>("");
  const [exportMesFim, setExportMesFim] = useState<string>("");

  const mesesComMovimento = useMemo(() => {
    return (payload?.meses || [])
      .filter(
        (m) =>
          m.compras.length > 0 ||
          m.pagamentos.some((p) => !p.cancelado) ||
          Number(m.total_compras) !== 0 ||
          Number(m.total_pagamentos) !== 0
      )
      .map((m) => m.mes)
      .sort();
  }, [payload]);

  useEffect(() => {
    if (mesesComMovimento.length === 0) return;
    const mesFechado = shiftMes(currentYYYYMM(), -1);
    const primeiro = mesesComMovimento[0];
    const ultimo = mesesComMovimento[mesesComMovimento.length - 1];
    const fim = mesesComMovimento.filter((m) => m <= mesFechado).pop() || ultimo;
    setExportMesInicio((v) => v || primeiro);
    setExportMesFim((v) => v || fim);
  }, [mesesComMovimento]);

  const relatorio = useMemo(() => {
    if (!payload || !exportMesInicio || !exportMesFim) return null;
    const ini = exportMesInicio <= exportMesFim ? exportMesInicio : exportMesFim;
    const fim = exportMesInicio <= exportMesFim ? exportMesFim : exportMesInicio;

    const meses = payload.meses
      .filter((m) => m.mes >= ini && m.mes <= fim)
      .filter(
        (m) =>
          m.compras.length > 0 ||
          m.pagamentos.some((p) => !p.cancelado) ||
          Number(m.total_compras) !== 0 ||
          Number(m.total_pagamentos) !== 0
      )
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((m) => {
        const validos = m.pagamentos.filter((p) => !p.cancelado);
        const migrado = validos
          .filter((p) => p.origem === "migracao_v2")
          .reduce((s, p) => s + Number(p.valor || 0), 0);
        const manuais = validos
          .filter((p) => p.origem !== "migracao_v2")
          .sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento));
        const compras = [...m.compras].sort((a, b) =>
          a.data_compra.localeCompare(b.data_compra)
        );
        return { ...m, compras, migrado, manuais };
      });

    const totalFalta = meses.reduce((s, m) => s + Number(m.divida_mes || 0), 0);
    return { ini, fim, meses, totalFalta };
  }, [payload, exportMesInicio, exportMesFim]);

  const handlePrint = () => {
    setShowExport(false);
    setTimeout(() => window.print(), 150);
  };


  const limparForm = () => {
    setValor(null);
    setForma("");
    setFormaOutro("");
    setObservacao("");
  };

  const handleSalvar = async () => {
    if (!valor || valor <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (!forma) {
      toast.error("Selecione a forma de pagamento.");
      return;
    }
    if (forma === "Outro" && !formaOutro.trim()) {
      toast.error("Informe a descrição da forma de pagamento.");
      return;
    }
    if (valor > mesData.divida_mes) {
      toast.error("O valor do pagamento não pode ser maior que a dívida restante deste mês.");
      return;
    }

    setSalvando(true);
    try {
      const { error } = await (supabase.rpc as any)("registrar_pagamento_v3", {
        p_cliente_id: Number(clienteId),
        p_mes_referencia: `${mesSelecionado}-01`,
        p_valor: valor,
        p_forma_pagamento: forma,
        p_forma_pagamento_outro: forma === "Outro" ? formaOutro.trim() : null,
        p_observacao: observacao.trim() || null,
      });
      if (error) throw error;
      toast.success("Pagamento registrado");
      setModalAberto(false);
      limparForm();
      await load(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao registrar pagamento");
    } finally {
      setSalvando(false);
    }
  };


  return (
    <div className="min-h-screen bg-background p-6">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body * { visibility: hidden !important; }
          #area-impressao-v3, #area-impressao-v3 * { visibility: visible !important; }
          #area-impressao-v3 {
            position: absolute; left: 0; top: 0; width: 100%;
            background: white; color: black;
          }
          .bloco-mes { break-inside: avoid; page-break-inside: avoid; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="max-w-6xl mx-auto space-y-6 no-print">
        <div className="flex items-center gap-4">
          <BackButton to="/admin/cadernetas?dest=v3" />
          <h1 className="text-3xl font-bold">
            Caderneta V3 {nomeCliente ? `- ${nomeCliente}` : ""}
          </h1>
          <Button
            variant="outline"
            className="ml-auto"
            onClick={() => setShowExport(true)}
          >
            <Printer className="h-4 w-4 mr-2" /> Exportar relatório
          </Button>
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
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">Pagamentos</h2>
                <Button onClick={() => setModalAberto(true)} disabled={mesData.divida_mes <= 0}>
                  <Plus className="h-4 w-4 mr-1" /> Registrar pagamento
                </Button>
              </div>
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

        <Dialog
          open={modalAberto}
          onOpenChange={(o) => {
            setModalAberto(o);
            if (!o) limparForm();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Registrar pagamento — {formatMesLabel(mesSelecionado)}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Dívida restante do mês: <strong>{formatBRL(mesData.divida_mes)}</strong>
              </div>

              <div className="space-y-2">
                <Label>Valor *</Label>
                <MoneyInput value={valor} onChange={setValor} allowEmpty />
              </div>

              <div className="space-y-2">
                <Label>Forma de pagamento *</Label>
                <Select value={forma} onValueChange={setForma}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="Cartão">Cartão</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {forma === "Outro" && (
                <div className="space-y-2">
                  <Label>Descrição da forma de pagamento *</Label>
                  <Input
                    value={formaOutro}
                    onChange={(e) => setFormaOutro(e.target.value)}
                    placeholder="Ex: Vale, troca, transferência"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setModalAberto(false);
                  limparForm();
                }}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button onClick={handleSalvar} disabled={salvando}>
                {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
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
                Escolha o período. O relatório usa apenas as compras em caderneta e os
                pagamentos da Caderneta V3.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Mês inicial</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={exportMesInicio}
                  onChange={(e) => setExportMesInicio(e.target.value)}
                >
                  {mesesComMovimento.map((m) => (
                    <option key={m} value={m}>{formatMesLabel(m)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Mês final</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={exportMesFim}
                  onChange={(e) => setExportMesFim(e.target.value)}
                >
                  {mesesComMovimento.map((m) => (
                    <option key={m} value={m}>{formatMesLabel(m)}</option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExport(false)}>
                Fechar
              </Button>
              <Button onClick={handlePrint} disabled={!relatorio}>
                <Printer className="h-4 w-4 mr-2" /> Gerar relatório
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Área de impressão */}
      {relatorio && (
        <div id="area-impressao-v3" className="hidden print:block">
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Caderneta</h1>
          <p style={{ fontSize: 14, marginBottom: 2 }}>
            Cliente: <strong>{nomeCliente}</strong>
          </p>
          <p style={{ fontSize: 14, marginBottom: 2 }}>
            Período: <strong>{formatMesLabel(relatorio.ini)}</strong> até{" "}
            <strong>{formatMesLabel(relatorio.fim)}</strong>
          </p>
          <p style={{ fontSize: 12, marginBottom: 16 }}>
            Data de emissão: {new Date().toLocaleDateString("pt-BR")}
          </p>

          {relatorio.meses.length === 0 && <p>Nenhuma movimentação no período.</p>}

          {relatorio.meses.map((m) => (
            <div
              key={m.mes}
              className="bloco-mes"
              style={{
                border: "1px solid #000",
                borderRadius: 6,
                padding: 12,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  borderBottom: "2px solid #000",
                  paddingBottom: 4,
                  marginBottom: 8,
                }}
              >
                {formatMesLabel(m.mes)}
              </div>

              <table style={{ width: "100%", fontSize: 13, marginBottom: 10 }}>
                <tbody>
                  <tr>
                    <td>Você comprou:</td>
                    <td style={{ textAlign: "right" }}>{formatBRL(m.total_compras)}</td>
                  </tr>
                  <tr>
                    <td>Você já pagou:</td>
                    <td style={{ textAlign: "right" }}>{formatBRL(m.total_pagamentos)}</td>
                  </tr>
                  <tr style={{ fontWeight: 700, fontSize: 15 }}>
                    <td>Falta pagar:</td>
                    <td style={{ textAlign: "right" }}>{formatBRL(m.divida_mes)}</td>
                  </tr>
                  <tr>
                    <td>Status:</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {m.divida_mes <= 0 ? "Pago" : "Falta pagar"}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Compras:</div>
              {m.compras.length === 0 ? (
                <div style={{ fontSize: 12, marginBottom: 8 }}>Nenhuma compra neste mês.</div>
              ) : (
                <div style={{ marginBottom: 10 }}>
                  {m.compras.map((c) => (
                    <div key={c.compra_id} style={{ fontSize: 12, marginBottom: 6 }}>
                      <div style={{ fontWeight: 600 }}>
                        {c.data_compra_brasil} - {c.hora_compra_brasil}
                      </div>
                      <table style={{ width: "100%" }}>
                        <tbody>
                          {c.itens.map((i) => (
                            <tr key={i.item_id}>
                              <td>{i.produto ?? `Produto #${i.produto_id ?? "?"}`}</td>
                              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                {i.quantidade} x {formatBRL(i.valor_unitario)}
                              </td>
                              <td style={{ textAlign: "right", whiteSpace: "nowrap", width: 90 }}>
                                {formatBRL(i.valor_total)}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td colSpan={2} style={{ textAlign: "right", fontWeight: 600 }}>
                              Total da compra
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>
                              {formatBRL(c.valor_total)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Pagamentos:</div>
              {m.migrado <= 0 && m.manuais.length === 0 ? (
                <div style={{ fontSize: 12 }}>Nenhum pagamento neste mês.</div>
              ) : (
                <div style={{ fontSize: 12 }}>
                  {m.migrado > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      Valores já pagos anteriormente: <strong>{formatBRL(m.migrado)}</strong>
                    </div>
                  )}
                  {m.manuais.map((p) => (
                    <div key={p.pagamento_id} style={{ marginBottom: 6 }}>
                      <div>
                        {p.data_pagamento_brasil} - {p.hora_pagamento_brasil}
                      </div>
                      <div>
                        <strong>{formatBRL(p.valor)}</strong>
                        {p.forma_pagamento ? ` — ${formaPagamentoLabel(p)}` : ""}
                      </div>
                      {p.observacao && <div>Observação: {p.observacao}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div
            className="bloco-mes"
            style={{ border: "2px solid #000", borderRadius: 6, padding: 12, marginTop: 8 }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>RESUMO</div>
            <table style={{ width: "100%", fontSize: 13 }}>
              <tbody>
                {relatorio.meses.map((m) => (
                  <tr key={m.mes}>
                    <td>{formatMesLabel(m.mes)}</td>
                    <td style={{ textAlign: "right" }}>
                      {m.divida_mes <= 0 ? "Pago" : `Falta pagar: ${formatBRL(m.divida_mes)}`}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ borderTop: "1px solid #000", paddingTop: 6 }} />
                </tr>
                <tr style={{ fontSize: 16, fontWeight: 700 }}>
                  <td>TOTAL QUE FALTA PAGAR</td>
                  <td style={{ textAlign: "right" }}>{formatBRL(relatorio.totalFalta)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>

  );
};

export default AdminCadernetaV3;

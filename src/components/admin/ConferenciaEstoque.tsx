import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ClipboardCheck,
  Loader2,
  Check,
  Trash2,
  Flag,
  Store,
  XCircle,
  Pencil,
  Plus,
  Minus,
  Ruler,
  AlertTriangle,
} from "lucide-react";

export interface ProdutoConferencia {
  produto_id: number;
  nome: string;
  quantidade: number;
}

interface Conferencia {
  id: number;
  mercadinho_id: number;
  status: string;
  iniciado_em: string;
  ultima_atualizacao_em: string;
  finalizado_em: string | null;
}

interface ItemConf {
  id: number;
  conferido: boolean;
  quantidade_sistema: number | null;
  quantidade_real: number | null;
  diferenca: number | null;
  observacao: string | null;
  registrado_em: string | null;
}

interface Props {
  mercadinhoId: number;
  mercadinhoNome: string;
  produtos: ProdutoConferencia[];
  filtro: string;
  filtrar: (p: ProdutoConferencia) => boolean;
  actionSlot?: (produtoId: number) => React.ReactNode;
  onAdicionar?: (produtoId: number) => void;
  onRemover?: (produtoId: number) => void;
}

const isConferido = (itens: Map<number, ItemConf>, produtoId: number) => {
  const it = itens.get(produtoId);
  return it?.conferido === true;
};

const fmtDate = (iso: string) =>
  format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });

const ConferenciaEstoque = ({
  mercadinhoId,
  mercadinhoNome,
  produtos,
  filtro,
  filtrar,
  actionSlot,
  onAdicionar,
  onRemover,
}: Props) => {
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [itens, setItens] = useState<Map<number, ItemConf>>(new Map());
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [confirmFinalizar, setConfirmFinalizar] = useState(false);
  const [confirmCancelar, setConfirmCancelar] = useState(false);

  // Modal quantidade real
  const [qtdRealProduto, setQtdRealProduto] = useState<ProdutoConferencia | null>(null);
  const [qtdRealValor, setQtdRealValor] = useState("");
  const [qtdRealObs, setQtdRealObs] = useState("");
  const [salvandoQtdReal, setSalvandoQtdReal] = useState(false);

  useEffect(() => {
    void carregarConf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mercadinhoId]);

  const carregarConf = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("conferencias_estoque")
      .select("*")
      .eq("mercadinho_id", mercadinhoId)
      .eq("status", "em_andamento")
      .maybeSingle();

    if (data) {
      setConf(data as Conferencia);
      const { data: rows } = await (supabase as any)
        .from("conferencias_estoque_itens")
        .select("id, produto_id, conferido, quantidade_sistema, quantidade_real, diferenca, observacao, registrado_em")
        .eq("conferencia_id", data.id);
      const m = new Map<number, ItemConf>();
      for (const r of (rows ?? []) as any[]) {
        m.set(r.produto_id, {
          id: r.id,
          conferido: r.conferido !== false,
          quantidade_sistema: r.quantidade_sistema,
          quantidade_real: r.quantidade_real,
          diferenca: r.diferenca,
          observacao: r.observacao,
          registrado_em: r.registrado_em,
        });
      }
      setItens(m);
    } else {
      setConf(null);
      setItens(new Map());
    }
    setLoading(false);
  };

  const iniciarConferencia = async () => {
    setCriando(true);
    const { data, error } = await (supabase as any)
      .from("conferencias_estoque")
      .insert({ mercadinho_id: mercadinhoId })
      .select()
      .single();
    setCriando(false);
    if (error) {
      toast.error("Erro ao iniciar conferência");
      return;
    }
    setConf(data as Conferencia);
    setItens(new Map());
    toast.success("Conferência iniciada");
  };

  const atualizarTimestamp = async (id: number) => {
    const agora = new Date().toISOString();
    await (supabase as any)
      .from("conferencias_estoque")
      .update({ ultima_atualizacao_em: agora })
      .eq("id", id);
    setConf((prev) => (prev ? { ...prev, ultima_atualizacao_em: agora } : prev));
  };

  const toggleItem = async (produtoId: number, checked: boolean) => {
    if (!conf) return;
    const existing = itens.get(produtoId);

    if (checked) {
      if (existing) {
        // Marcar row existente (com ou sem divergência) como conferido
        const { error } = await (supabase as any)
          .from("conferencias_estoque_itens")
          .update({ conferido: true })
          .eq("id", existing.id);
        if (error) {
          toast.error("Erro ao salvar");
          return;
        }
        const novo = new Map(itens);
        novo.set(produtoId, { ...existing, conferido: true });
        setItens(novo);
      } else {
        const { data, error } = await (supabase as any)
          .from("conferencias_estoque_itens")
          .insert({ conferencia_id: conf.id, produto_id: produtoId, conferido: true })
          .select("id")
          .single();
        if (error) {
          toast.error("Erro ao salvar");
          return;
        }
        const novo = new Map(itens);
        novo.set(produtoId, {
          id: data.id,
          conferido: true,
          quantidade_sistema: null,
          quantidade_real: null,
          diferenca: null,
          observacao: null,
          registrado_em: null,
        });
        setItens(novo);
      }
    } else {
      if (!existing) return;
      if (existing.quantidade_real !== null) {
        // Manter divergência, apenas desmarcar
        const { error } = await (supabase as any)
          .from("conferencias_estoque_itens")
          .update({ conferido: false })
          .eq("id", existing.id);
        if (error) {
          toast.error("Erro ao remover");
          return;
        }
        const novo = new Map(itens);
        novo.set(produtoId, { ...existing, conferido: false });
        setItens(novo);
      } else {
        const { error } = await (supabase as any)
          .from("conferencias_estoque_itens")
          .delete()
          .eq("id", existing.id);
        if (error) {
          toast.error("Erro ao remover");
          return;
        }
        const novo = new Map(itens);
        novo.delete(produtoId);
        setItens(novo);
      }
    }
    void atualizarTimestamp(conf.id);
  };

  const abrirQtdReal = (p: ProdutoConferencia) => {
    const existing = itens.get(p.produto_id);
    setQtdRealProduto(p);
    setQtdRealValor(
      existing?.quantidade_real != null ? String(existing.quantidade_real) : ""
    );
    setQtdRealObs(existing?.observacao ?? "");
  };

  const salvarQtdReal = async () => {
    if (!conf || !qtdRealProduto) return;
    const valorNum = parseInt(qtdRealValor);
    if (Number.isNaN(valorNum) || valorNum < 0) {
      toast.error("Informe uma quantidade real válida");
      return;
    }
    setSalvandoQtdReal(true);
    const sistema = qtdRealProduto.quantidade;
    const diferenca = valorNum - sistema;
    const agora = new Date().toISOString();
    const obs = qtdRealObs.trim() || null;
    const existing = itens.get(qtdRealProduto.produto_id);

    try {
      if (existing) {
        const { error } = await (supabase as any)
          .from("conferencias_estoque_itens")
          .update({
            quantidade_sistema: sistema,
            quantidade_real: valorNum,
            diferenca,
            observacao: obs,
            registrado_em: agora,
          })
          .eq("id", existing.id);
        if (error) throw error;
        const novo = new Map(itens);
        novo.set(qtdRealProduto.produto_id, {
          ...existing,
          quantidade_sistema: sistema,
          quantidade_real: valorNum,
          diferenca,
          observacao: obs,
          registrado_em: agora,
        });
        setItens(novo);
      } else {
        const { data, error } = await (supabase as any)
          .from("conferencias_estoque_itens")
          .insert({
            conferencia_id: conf.id,
            produto_id: qtdRealProduto.produto_id,
            conferido: false,
            quantidade_sistema: sistema,
            quantidade_real: valorNum,
            diferenca,
            observacao: obs,
            registrado_em: agora,
          })
          .select("id")
          .single();
        if (error) throw error;
        const novo = new Map(itens);
        novo.set(qtdRealProduto.produto_id, {
          id: data.id,
          conferido: false,
          quantidade_sistema: sistema,
          quantidade_real: valorNum,
          diferenca,
          observacao: obs,
          registrado_em: agora,
        });
        setItens(novo);
      }
      void atualizarTimestamp(conf.id);
      toast.success("Quantidade real registrada");
      setQtdRealProduto(null);
      setQtdRealValor("");
      setQtdRealObs("");
    } catch (e) {
      toast.error("Erro ao salvar quantidade real");
    } finally {
      setSalvandoQtdReal(false);
    }
  };

  const finalizarConferencia = async () => {
    if (!conf) return;
    const agora = new Date().toISOString();
    const { error } = await (supabase as any)
      .from("conferencias_estoque")
      .update({ status: "finalizada", finalizado_em: agora, ultima_atualizacao_em: agora })
      .eq("id", conf.id);
    if (error) {
      toast.error("Erro ao finalizar");
      return;
    }
    toast.success("Conferência finalizada");
    setConfirmFinalizar(false);
    setConf(null);
    setItens(new Map());
  };

  const limparConferencia = async () => {
    if (!conf) return;
    const { error } = await (supabase as any)
      .from("conferencias_estoque")
      .delete()
      .eq("id", conf.id);
    if (error) {
      toast.error("Erro ao limpar");
      return;
    }
    setConfirmLimpar(false);
    setConf(null);
    setItens(new Map());
    await iniciarConferencia();
  };

  const cancelarConferencia = async () => {
    if (!conf) return;
    const { error } = await (supabase as any)
      .from("conferencias_estoque")
      .delete()
      .eq("id", conf.id);
    if (error) {
      toast.error("Erro ao cancelar");
      return;
    }
    toast.success("Conferência cancelada");
    setConfirmCancelar(false);
    setConf(null);
    setItens(new Map());
  };

  const produtosFiltrados = useMemo(
    () =>
      produtos
        .filter(filtrar)
        .sort((a, b) =>
          a.nome.toLowerCase().localeCompare(b.nome.toLowerCase(), "pt-BR")
        ),
    [produtos, filtrar]
  );

  const pendentes = useMemo(
    () => produtosFiltrados.filter((p) => !isConferido(itens, p.produto_id)),
    [produtosFiltrados, itens]
  );
  const conferidos = useMemo(
    () => produtosFiltrados.filter((p) => isConferido(itens, p.produto_id)),
    [produtosFiltrados, itens]
  );

  const totalGeral = produtos.length;
  const totalConferidosGeral = produtos.filter((p) => isConferido(itens, p.produto_id)).length;
  const totalPendentesGeral = totalGeral - totalConferidosGeral;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!conf) {
    return (
      <Card>
        <CardHeader className="bg-primary/5">
          <CardTitle className="text-2xl flex items-center gap-3">
            <Store className="h-6 w-6" />
            {mercadinhoNome} — Conferência
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground">
            Nenhuma conferência em andamento para {mercadinhoNome}.
          </p>
          <Button
            onClick={iniciarConferencia}
            disabled={criando}
            size="lg"
            className="gap-2"
          >
            {criando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCheck className="h-5 w-5" />
            )}
            Conferir Estoque
          </Button>
        </CardContent>
      </Card>
    );
  }

  const renderDivergenciaBlock = (it: ItemConf) => (
    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs space-y-0.5">
      <p className="font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Quantidade real informada
      </p>
      <p>Sistema: <span className="font-medium">{it.quantidade_sistema}</span></p>
      <p>Encontrado: <span className="font-medium">{it.quantidade_real}</span></p>
      <p>
        Diferença:{" "}
        <span
          className={`font-medium ${
            (it.diferenca ?? 0) === 0
              ? ""
              : (it.diferenca ?? 0) > 0
              ? "text-green-700"
              : "text-red-700"
          }`}
        >
          {(it.diferenca ?? 0) > 0 ? "+" : ""}
          {it.diferenca}
        </span>
      </p>
      {it.observacao && <p className="italic">Obs: {it.observacao}</p>}
    </div>
  );

  return (
    <Card className="border-primary/40">
      <CardHeader className="bg-primary/5 space-y-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <CardTitle className="text-2xl flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            {mercadinhoNome} — Conferência em andamento
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmLimpar(true)}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" />
              Limpar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmCancelar(true)}
              className="gap-1 text-destructive hover:text-destructive"
            >
              <XCircle className="h-4 w-4" />
              Cancelar
            </Button>
            <Button size="sm" onClick={() => setConfirmFinalizar(true)} className="gap-1">
              <Flag className="h-4 w-4" />
              Finalizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-background rounded-md p-3 border">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{totalGeral}</p>
            <p className="text-xs text-muted-foreground">produtos</p>
          </div>
          <div className="bg-background rounded-md p-3 border">
            <p className="text-xs text-muted-foreground">Conferidos</p>
            <p className="text-2xl font-bold text-green-600">
              ✔ {totalConferidosGeral}
            </p>
          </div>
          <div className="bg-background rounded-md p-3 border">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-amber-600">
              ⏳ {totalPendentesGeral}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>Iniciada em: {fmtDate(conf.iniciado_em)}</span>
          <span>Última atualização: {fmtDate(conf.ultima_atualizacao_em)}</span>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Pendentes */}
        <div>
          <h3 className="font-semibold text-base mb-2">
            Produtos pendentes ({pendentes.length})
          </h3>
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum produto pendente.
            </p>
          ) : (
            <ul className="divide-y border rounded-md">
              {pendentes.map((p) => {
                const it = itens.get(p.produto_id);
                return (
                  <li key={p.produto_id} className="p-3 hover:bg-accent/40">
                    <div className="flex flex-wrap items-center gap-3">
                      <Checkbox
                        id={`pend-${p.produto_id}`}
                        checked={false}
                        onCheckedChange={(v) => toggleItem(p.produto_id, v === true)}
                        className="h-6 w-6"
                      />
                      <label
                        htmlFor={`pend-${p.produto_id}`}
                        className="flex-1 min-w-[160px] cursor-pointer"
                      >
                        <span className="font-medium">{p.nome}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          Qtd: {p.quantidade}
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {onAdicionar && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => onAdicionar(p.produto_id)}
                            title="Adicionar quantidade ao estoque"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Adicionar
                          </Button>
                        )}
                        {onRemover && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-destructive hover:text-destructive"
                            onClick={() => onRemover(p.produto_id)}
                            title="Remover quantidade do estoque"
                          >
                            <Minus className="h-3.5 w-3.5" />
                            Remover
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => abrirQtdReal(p)}
                          title="Informar quantidade real encontrada"
                        >
                          <Ruler className="h-3.5 w-3.5" />
                          Quantidade real
                        </Button>
                        {actionSlot?.(p.produto_id)}
                      </div>
                    </div>
                    {it && it.quantidade_real !== null && renderDivergenciaBlock(it)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Conferidos (accordion, fechado por padrão) */}
        <Accordion type="single" collapsible>
          <AccordionItem value="conferidos" className="border rounded-md">
            <AccordionTrigger className="px-3 py-2 hover:no-underline">
              <span className="flex items-center gap-2 font-semibold">
                <Check className="h-4 w-4 text-green-600" />
                Produtos conferidos ({conferidos.length})
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-0 pb-0">
              {conferidos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">
                  Ainda nenhum produto conferido.
                </p>
              ) : (
                <ul className="divide-y border-t">
                  {conferidos.map((p) => {
                    const it = itens.get(p.produto_id);
                    const temDiv = it && it.quantidade_real !== null;
                    return (
                      <li
                        key={p.produto_id}
                        className="flex items-center gap-3 p-3 hover:bg-accent/40"
                      >
                        <Checkbox
                          id={`conf-${p.produto_id}`}
                          checked
                          onCheckedChange={(v) =>
                            toggleItem(p.produto_id, v === true)
                          }
                          className="h-6 w-6"
                        />
                        <label
                          htmlFor={`conf-${p.produto_id}`}
                          className="flex-1 cursor-pointer flex items-center gap-2 flex-wrap"
                        >
                          <span className="font-medium line-through opacity-70">
                            {p.nome}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Qtd: {p.quantidade}
                          </span>
                          {temDiv && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-medium rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                              title={`Sistema ${it!.quantidade_sistema} / Real ${it!.quantidade_real}`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Divergência {(it!.diferenca ?? 0) > 0 ? "+" : ""}
                              {it!.diferenca}
                            </span>
                          )}
                        </label>
                        {actionSlot?.(p.produto_id)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>

      {/* Confirm limpar */}
      <Dialog open={confirmLimpar} onOpenChange={setConfirmLimpar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conferência</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deseja realmente iniciar uma nova conferência? Todo o progresso atual será perdido.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLimpar(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={limparConferencia}>
              Nova Conferência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm finalizar */}
      <Dialog open={confirmFinalizar} onOpenChange={setConfirmFinalizar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar conferência</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Finalizar a conferência de {mercadinhoNome}? Ela será marcada como concluída.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFinalizar(false)}>
              Cancelar
            </Button>
            <Button onClick={finalizarConferencia}>Finalizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm cancelar */}
      <Dialog open={confirmCancelar} onOpenChange={setConfirmCancelar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar conferência</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deseja cancelar esta conferência? Todo o progresso desta conferência será perdido.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancelar(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={cancelarConferencia}>
              Cancelar Conferência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal quantidade real */}
      <Dialog
        open={!!qtdRealProduto}
        onOpenChange={(o) => !o && !salvandoQtdReal && setQtdRealProduto(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Informar quantidade real</DialogTitle>
          </DialogHeader>
          {qtdRealProduto && (
            <div className="space-y-3">
              <p className="font-medium">{qtdRealProduto.nome}</p>
              <div>
                <Label>Quantidade no sistema</Label>
                <Input value={qtdRealProduto.quantidade} readOnly disabled />
              </div>
              <div>
                <Label htmlFor="qtd-real">Quantidade real encontrada</Label>
                <Input
                  id="qtd-real"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={qtdRealValor}
                  onChange={(e) => setQtdRealValor(e.target.value)}
                  autoFocus
                />
                {qtdRealValor !== "" && !Number.isNaN(parseInt(qtdRealValor)) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Diferença:{" "}
                    <span className="font-medium">
                      {parseInt(qtdRealValor) - qtdRealProduto.quantidade > 0 ? "+" : ""}
                      {parseInt(qtdRealValor) - qtdRealProduto.quantidade}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="qtd-real-obs">Observação (opcional)</Label>
                <Textarea
                  id="qtd-real-obs"
                  value={qtdRealObs}
                  onChange={(e) => setQtdRealObs(e.target.value)}
                  placeholder="Ex.: produto danificado, vencido, etc."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setQtdRealProduto(null)}
              disabled={salvandoQtdReal}
            >
              Cancelar
            </Button>
            <Button onClick={salvarQtdReal} disabled={salvandoQtdReal}>
              {salvandoQtdReal && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ConferenciaEstoque;

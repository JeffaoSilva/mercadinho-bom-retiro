import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

interface Props {
  mercadinhoId: number;
  mercadinhoNome: string;
  produtos: ProdutoConferencia[];
  filtro: string;
  filtrar: (p: ProdutoConferencia) => boolean;
  actionSlot?: (produtoId: number) => React.ReactNode;
}

const fmtDate = (iso: string) =>
  format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });

const ConferenciaEstoque = ({
  mercadinhoId,
  mercadinhoNome,
  produtos,
  filtro,
  filtrar,
  actionSlot,
}: Props) => {
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [itensConferidos, setItensConferidos] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [confirmFinalizar, setConfirmFinalizar] = useState(false);
  const [confirmCancelar, setConfirmCancelar] = useState(false);

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
      const { data: itens } = await (supabase as any)
        .from("conferencias_estoque_itens")
        .select("produto_id")
        .eq("conferencia_id", data.id);
      setItensConferidos(new Set((itens ?? []).map((i: any) => i.produto_id)));
    } else {
      setConf(null);
      setItensConferidos(new Set());
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
    setItensConferidos(new Set());
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
    const novo = new Set(itensConferidos);
    if (checked) {
      novo.add(produtoId);
      setItensConferidos(novo);
      const { error } = await (supabase as any)
        .from("conferencias_estoque_itens")
        .insert({ conferencia_id: conf.id, produto_id: produtoId });
      if (error && !String(error.message || "").includes("duplicate")) {
        toast.error("Erro ao salvar");
        novo.delete(produtoId);
        setItensConferidos(new Set(novo));
        return;
      }
    } else {
      novo.delete(produtoId);
      setItensConferidos(novo);
      const { error } = await (supabase as any)
        .from("conferencias_estoque_itens")
        .delete()
        .eq("conferencia_id", conf.id)
        .eq("produto_id", produtoId);
      if (error) {
        toast.error("Erro ao remover");
        novo.add(produtoId);
        setItensConferidos(new Set(novo));
        return;
      }
    }
    void atualizarTimestamp(conf.id);
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
    setItensConferidos(new Set());
  };

  const limparConferencia = async () => {
    if (!conf) return;
    // Apaga a conferência atual (cascade remove itens) e cria uma nova
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
    setItensConferidos(new Set());
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
    setItensConferidos(new Set());
  };

  const produtosFiltrados = useMemo(
    () => produtos.filter(filtrar),
    [produtos, filtrar, filtro]
  );

  const pendentes = useMemo(
    () => produtosFiltrados.filter((p) => !itensConferidos.has(p.produto_id)),
    [produtosFiltrados, itensConferidos]
  );
  const conferidos = useMemo(
    () => produtosFiltrados.filter((p) => itensConferidos.has(p.produto_id)),
    [produtosFiltrados, itensConferidos]
  );

  const totalGeral = produtos.length;
  const totalConferidosGeral = produtos.filter((p) =>
    itensConferidos.has(p.produto_id)
  ).length;
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

  return (
    <Card className="border-primary/40">
      <CardHeader className="bg-primary/5 space-y-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <CardTitle className="text-2xl flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            {mercadinhoNome} — Conferência em andamento
          </CardTitle>
          <div className="flex gap-2">
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
              size="sm"
              onClick={() => setConfirmFinalizar(true)}
              className="gap-1"
            >
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
              {pendentes.map((p) => (
                <li
                  key={p.produto_id}
                  className="flex items-center gap-3 p-3 hover:bg-accent/40"
                >
                  <Checkbox
                    id={`pend-${p.produto_id}`}
                    checked={false}
                    onCheckedChange={(v) => toggleItem(p.produto_id, v === true)}
                    className="h-6 w-6"
                  />
                  <label
                    htmlFor={`pend-${p.produto_id}`}
                    className="flex-1 cursor-pointer"
                  >
                    <span className="font-medium">{p.nome}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      Qtd: {p.quantidade}
                    </span>
                  </label>
                  {actionSlot?.(p.produto_id)}
                </li>
              ))}
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
                  {conferidos.map((p) => (
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
                        className="flex-1 cursor-pointer"
                      >
                        <span className="font-medium line-through opacity-70">
                          {p.nome}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          Qtd: {p.quantidade}
                        </span>
                      </label>
                      {actionSlot?.(p.produto_id)}
                    </li>
                  ))}
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
            Deseja realmente iniciar uma nova conferência? Todo o progresso
            atual será perdido.
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
            Finalizar a conferência de {mercadinhoNome}? Ela será marcada como
            concluída.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFinalizar(false)}>
              Cancelar
            </Button>
            <Button onClick={finalizarConferencia}>Finalizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ConferenciaEstoque;

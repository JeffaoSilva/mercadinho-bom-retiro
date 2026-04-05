import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, RotateCcw, Trash2, MinusCircle, Loader2 } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { estornarCompraCompleta } from "@/services/estornos";
import { format } from "date-fns";
import { MoneyInput } from "@/components/MoneyInput";
import { PaymentBadge } from "@/components/PaymentBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ItemCompra {
  id: number;
  produto_id: number;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  produto?: { nome: string; quantidade_atual: number };
}

interface CompraComItens {
  id: number;
  criado_em: string;
  valor_total: number;
  mes_referencia: string;
  forma_pagamento: string;
  paga: boolean;
  paga_em: string | null;
  itens: ItemCompra[];
}

interface Abatimento {
  id: number;
  valor: number;
  criado_em: string;
}

interface ClienteInfo {
  id: number;
  nome: string;
}

interface DebitoInfo {
  total_mes_atual: number;
  total_mes_anterior: number;
  total_atrasado: number;
  total_pix: number;
  mes_atual: string;
  mes_anterior: string;
}

const AdminCadernetaDetalhe = () => {
  const navigate = useNavigate();
  const { clienteId } = useParams<{ clienteId: string }>();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();

  const [cliente, setCliente] = useState<ClienteInfo | null>(null);
  const [compras, setCompras] = useState<CompraComItens[]>([]);
  const [abatimentos, setAbatimentos] = useState<Abatimento[]>([]);
  const [debitoInfo, setDebitoInfo] = useState<DebitoInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAbatimento, setShowAbatimento] = useState(false);
  const [abatimentoValor, setAbatimentoValor] = useState(0);
  const [salvandoAbatimento, setSalvandoAbatimento] = useState(false);

  const [confirmPagarMes, setConfirmPagarMes] = useState<string | null>(null);
  const [confirmPagarAtrasadas, setConfirmPagarAtrasadas] = useState(false);

  const [itemParaEstornar, setItemParaEstornar] = useState<ItemCompra | null>(null);
  const [estornoComDevolucao, setEstornoComDevolucao] = useState(true);
  const [confirmEstornoCompra, setConfirmEstornoCompra] = useState(false);
  const [compraParaEstornar, setCompraParaEstornar] = useState<CompraComItens | null>(null);

  const cId = clienteId ? parseInt(clienteId) : null;

  const loadData = useCallback(async () => {
    if (!cId) return;
    setLoading(true);

    const [clienteRes, comprasRes, abatimentosRes, debitosRes] = await Promise.all([
      supabase.from("clientes").select("id, nome").eq("id", cId).single(),
      supabase
        .from("compras")
        .select("id, criado_em, valor_total, mes_referencia, forma_pagamento, paga, paga_em")
        .eq("cliente_id", cId)
        .order("criado_em", { ascending: false }),
      supabase
        .from("abatimentos" as any)
        .select("id, valor, criado_em")
        .eq("cliente_id", cId)
        .order("criado_em", { ascending: false }),
      supabase.rpc("admin_listar_clientes_debitos" as any),
    ]);

    if (clienteRes.error || !clienteRes.data) {
      toast.error("Cliente não encontrado");
      navigate("/admin/cadernetas");
      return;
    }

    setCliente(clienteRes.data as ClienteInfo);
    setAbatimentos((abatimentosRes.data || []) as unknown as Abatimento[]);

    // Load items for all purchases
    const comprasList = (comprasRes.data || []) as any[];
    if (comprasList.length > 0) {
      const compraIds = comprasList.map((c: any) => c.id);
      const { data: itensData } = await supabase
        .from("itens_compra")
        .select("*, produto:produtos(nome, quantidade_atual)")
        .in("compra_id", compraIds);

      const itensPorCompra: Record<number, ItemCompra[]> = {};
      for (const item of (itensData || []) as any[]) {
        if (!itensPorCompra[item.compra_id]) itensPorCompra[item.compra_id] = [];
        itensPorCompra[item.compra_id].push(item);
      }

      setCompras(
        comprasList.map((c: any) => ({
          ...c,
          itens: itensPorCompra[c.id] || [],
        }))
      );
    } else {
      setCompras([]);
    }

    // Extract debito info for this client
    if (!debitosRes.error && debitosRes.data) {
      const payload = debitosRes.data as any;
      const clienteDebito = (payload.clientes || []).find((c: any) => c.cliente_id === cId);
      setDebitoInfo({
        total_mes_atual: clienteDebito?.total_mes_atual || 0,
        total_mes_anterior: clienteDebito?.total_mes_anterior || 0,
        total_atrasado: clienteDebito?.total_atrasado || 0,
        total_pix: clienteDebito?.total_pix || 0,
        mes_atual: payload.mes_atual,
        mes_anterior: payload.mes_anterior,
      });
    }

    setLoading(false);
  }, [cId, navigate]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadData();
  }, [isAuthenticated, authLoading, navigate, loadData]);

  const formatarData = (iso: string) => {
    try {
      return format(new Date(iso), "dd/MM/yyyy");
    } catch {
      return iso;
    }
  };

  const formatarHora = (iso: string) => {
    try {
      return format(new Date(iso), "HH:mm");
    } catch {
      return "";
    }
  };

  // Financial calculations
  const totalCaderneta = debitoInfo
    ? debitoInfo.total_mes_atual + debitoInfo.total_mes_anterior + debitoInfo.total_atrasado
    : 0;
  const totalAbatimentos = abatimentos.reduce((s, a) => s + Number(a.valor), 0);
  const totalDevido = Math.max(totalCaderneta - totalAbatimentos, 0);
  const totalPix = debitoInfo?.total_pix || 0;

  // Actions
  const marcarMesPago = async () => {
    if (!cId || !confirmPagarMes) return;
    const { data, error } = await supabase.rpc("admin_marcar_pago_mes" as any, {
      p_cliente_id: cId,
      p_mes_referencia: confirmPagarMes,
    });
    setConfirmPagarMes(null);
    if (error) {
      toast.error("Erro ao marcar como pago");
    } else {
      const resultado = data as { ok: boolean; compras_marcadas: number };
      toast.success(`${resultado.compras_marcadas} compra(s) marcada(s) como paga(s)`);
      loadData();
    }
  };

  const marcarAtrasadasPagas = async () => {
    if (!cId) return;
    const { data, error } = await supabase.rpc("admin_marcar_atrasadas_pagas" as any, {
      p_cliente_id: cId,
    });
    setConfirmPagarAtrasadas(false);
    if (error) {
      toast.error("Erro ao marcar como pago");
    } else {
      const resultado = data as { ok: boolean; compras_marcadas: number };
      toast.success(`${resultado.compras_marcadas} compra(s) atrasada(s) marcada(s) como paga(s)`);
      loadData();
    }
  };

  const estornarItem = async () => {
    if (!itemParaEstornar) return;
    const { data, error } = await supabase.rpc("admin_estornar_item" as any, {
      p_item_compra_id: itemParaEstornar.id,
      p_devolver_estoque: estornoComDevolucao,
      p_prateleira_id: null,
      p_motivo: null,
    });
    setItemParaEstornar(null);
    if (error) {
      toast.error("Erro ao estornar item");
    } else {
      const resultado = data as { ok: boolean; compra_removida?: boolean };
      toast.success(resultado.compra_removida ? "Item estornado e compra removida" : "Item estornado com sucesso");
      loadData();
    }
  };

  const handleEstornoCompraCompleta = async () => {
    if (!compraParaEstornar) return;
    const result = await estornarCompraCompleta(compraParaEstornar.id, estornoComDevolucao, undefined);
    setConfirmEstornoCompra(false);
    setCompraParaEstornar(null);
    if (result.ok) {
      toast.success("Compra estornada com sucesso");
      loadData();
    } else {
      toast.error(result.error || "Erro ao estornar compra");
    }
  };

  const salvarAbatimento = async () => {
    if (!cId || abatimentoValor <= 0) return;
    setSalvandoAbatimento(true);
    const { error } = await supabase.from("abatimentos" as any).insert({
      cliente_id: cId,
      valor: abatimentoValor,
    } as any);
    setSalvandoAbatimento(false);
    setShowAbatimento(false);
    setAbatimentoValor(0);
    if (error) {
      toast.error("Erro ao registrar abatimento");
    } else {
      toast.success("Abatimento registrado com sucesso");
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <BackButton to="/admin/cadernetas" />
          <h1 className="text-3xl font-bold">{cliente?.nome}</h1>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Total devido</p>
            <p className="text-xl font-bold">R$ {totalDevido.toFixed(2)}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <p className="text-xs text-emerald-600">Compras no PIX</p>
            <p className="text-xl font-bold text-emerald-700">R$ {totalPix.toFixed(2)}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xs text-green-600">Total abatido</p>
            <p className="text-xl font-bold text-green-700">-R$ {totalAbatimentos.toFixed(2)}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => { setAbatimentoValor(0); setShowAbatimento(true); }}
          >
            <MinusCircle className="h-4 w-4 mr-2" />
            Abater valor
          </Button>

          {debitoInfo && debitoInfo.total_mes_anterior > 0 && (
            <Button
              variant="outline"
              className="bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
              onClick={() => setConfirmPagarMes(debitoInfo.mes_anterior)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Marcar mês anterior como pago
            </Button>
          )}

          {debitoInfo && debitoInfo.total_atrasado > 0 && (
            <Button
              variant="outline"
              className="bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-300"
              onClick={() => setConfirmPagarAtrasadas(true)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Marcar atrasadas como pagas
            </Button>
          )}
        </div>

        {/* Abatimentos */}
        {abatimentos.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Abatimentos</h3>
            {abatimentos.map((ab) => (
              <div key={ab.id} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                <span className="text-sm text-green-700">{formatarData(ab.criado_em)} {formatarHora(ab.criado_em)}</span>
                <span className="font-semibold text-green-700">-R$ {Number(ab.valor).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Purchase History */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Histórico de Compras</h2>

          {compras.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma compra encontrada.</p>
          ) : (
            compras.map((compra) => (
              <Card key={compra.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Purchase header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-muted/30 border-b">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-medium">{formatarData(compra.criado_em)}</span>
                      <span className="text-muted-foreground">{formatarHora(compra.criado_em)}</span>
                      <span className="text-muted-foreground">Ref: {compra.mes_referencia}</span>
                      <PaymentBadge formaPagamento={compra.forma_pagamento} />
                      {compra.paga ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">
                          PAGO
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700">
                          EM ABERTO
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">R$ {Number(compra.valor_total).toFixed(2)}</span>
                      {!compra.paga && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive h-7 px-2"
                          onClick={() => {
                            setCompraParaEstornar(compra);
                            setEstornoComDevolucao(true);
                            setConfirmEstornoCompra(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Estornar
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="divide-y">
                    {compra.itens.map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-4 py-2 text-sm">
                        <div className="flex-1">
                          <span>{item.produto?.nome || "-"}</span>
                          <span className="text-muted-foreground ml-2">×{item.quantidade}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>R$ {Number(item.valor_total).toFixed(2)}</span>
                          {!compra.paga && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setItemParaEstornar(item);
                                setEstornoComDevolucao(true);
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Modal Abatimento */}
      <Dialog open={showAbatimento} onOpenChange={setShowAbatimento}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Abater valor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Informe o valor a abater da dívida de <strong>{cliente?.nome}</strong>.
            </p>
            <MoneyInput value={abatimentoValor} onChange={setAbatimentoValor} />
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              disabled={abatimentoValor <= 0 || salvandoAbatimento}
              onClick={salvarAbatimento}
            >
              {salvandoAbatimento ? "Salvando..." : "Confirmar abatimento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação Marcar Mês Pago */}
      <AlertDialog open={!!confirmPagarMes} onOpenChange={() => setConfirmPagarMes(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as compras do mês <strong>{confirmPagarMes}</strong> de {cliente?.nome} serão marcadas como pagas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={marcarMesPago}>Confirmar Pagamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação Marcar Atrasadas Pagas */}
      <AlertDialog open={confirmPagarAtrasadas} onOpenChange={setConfirmPagarAtrasadas}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar atrasadas como pagas?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as compras atrasadas (meses anteriores) de {cliente?.nome} serão marcadas como pagas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={marcarAtrasadasPagas}>Confirmar Pagamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação Estorno de Compra Completa */}
      <AlertDialog open={confirmEstornoCompra} onOpenChange={setConfirmEstornoCompra}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar compra completa?</AlertDialogTitle>
            <AlertDialogDescription>
              <p className="mb-2">Esta ação irá:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Remover a compra inteira</li>
                <li>Devolver todos os itens ao estoque</li>
                <li><strong>Não poderá ser desfeita</strong></li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEstornoCompraCompleta}>Confirmar Estorno</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Estorno de Item */}
      <AlertDialog open={!!itemParaEstornar} onOpenChange={() => setItemParaEstornar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar item?</AlertDialogTitle>
            <AlertDialogDescription>
              <p className="mb-4">
                Produto: <strong>{itemParaEstornar?.produto?.nome}</strong><br />
                Quantidade: <strong>{itemParaEstornar?.quantidade}</strong><br />
                Valor: <strong>R$ {Number(itemParaEstornar?.valor_total || 0).toFixed(2)}</strong>
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant={estornoComDevolucao ? "default" : "outline"}
                  onClick={() => setEstornoComDevolucao(true)}
                  className="justify-start"
                >
                  <CheckCircle className={`h-4 w-4 mr-2 ${estornoComDevolucao ? "" : "opacity-0"}`} />
                  Estornar E devolver ao estoque
                </Button>
                <Button
                  variant={!estornoComDevolucao ? "default" : "outline"}
                  onClick={() => setEstornoComDevolucao(false)}
                  className="justify-start"
                >
                  <CheckCircle className={`h-4 w-4 mr-2 ${!estornoComDevolucao ? "" : "opacity-0"}`} />
                  Estornar SEM devolver ao estoque
                </Button>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={estornarItem}>Confirmar Estorno</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCadernetaDetalhe;

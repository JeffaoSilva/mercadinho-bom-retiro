import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Search, Eye, CheckCircle, RotateCcw, Trash2, Users, MinusCircle } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { estornarCompraCompleta } from "@/services/estornos";
import { format } from "date-fns";
import { MoneyInput } from "@/components/MoneyInput";
import { PaymentBadge } from "@/components/PaymentBadge";

interface ClienteDebito {
  cliente_id: number;
  cliente_nome: string;
  total_mes_atual: number;
  total_mes_anterior: number;
  total_atrasado: number;
  total_pix: number;
}

interface DebitosPayload {
  mes_atual: string;
  mes_anterior: string;
  clientes: ClienteDebito[];
}

interface ItemCompra {
  id: number;
  produto_id: number;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  produto?: { nome: string; quantidade_atual: number };
}

interface Compra {
  id: number;
  criado_em: string;
  valor_total: number;
  mes_referencia: string;
  forma_pagamento: string;
  eh_visitante?: boolean;
  cliente?: { nome: string };
}

interface Abatimento {
  id: number;
  valor: number;
  criado_em: string;
}

const AdminCadernetas = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  
  const [debitos, setDebitos] = useState<DebitosPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const [abatimentosPorCliente, setAbatimentosPorCliente] = useState<Record<number, number>>({});
  
  const [selectedCliente, setSelectedCliente] = useState<ClienteDebito | null>(null);
  const [comprasCliente, setComprasCliente] = useState<Compra[]>([]);
  const [abatimentosCliente, setAbatimentosCliente] = useState<Abatimento[]>([]);
  const [showDetalhes, setShowDetalhes] = useState(false);
  
  const [selectedCompra, setSelectedCompra] = useState<Compra | null>(null);
  const [itensCompra, setItensCompra] = useState<ItemCompra[]>([]);
  const [showItens, setShowItens] = useState(false);
  
  const [showAbatimento, setShowAbatimento] = useState(false);
  const [abatimentoValor, setAbatimentoValor] = useState(0);
  const [salvandoAbatimento, setSalvandoAbatimento] = useState(false);
  
  const [confirmPagarMes, setConfirmPagarMes] = useState<string | null>(null);
  const [confirmPagarAtrasadas, setConfirmPagarAtrasadas] = useState(false);
  
  const [itemParaEstornar, setItemParaEstornar] = useState<ItemCompra | null>(null);
  const [estornoComDevolucao, setEstornoComDevolucao] = useState(true);

  const [confirmEstornoCompra, setConfirmEstornoCompra] = useState(false);

  const [showVisitantes, setShowVisitantes] = useState(false);
  const [comprasVisitante, setComprasVisitante] = useState<Compra[]>([]);
  const [loadingVisitantes, setLoadingVisitantes] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadDebitos();
  }, [isAuthenticated, authLoading, navigate]);

  const loadDebitos = async () => {
    setLoading(true);
    
    const [debitosRes, abatimentosRes] = await Promise.all([
      supabase.rpc("admin_listar_clientes_debitos" as any),
      supabase.from("abatimentos" as any).select("cliente_id, valor"),
    ]);
    
    if (debitosRes.error) {
      console.error("Erro ao carregar débitos", debitosRes.error);
      toast.error("Erro ao carregar dados");
    } else {
      setDebitos(debitosRes.data as unknown as DebitosPayload);
    }

    if (!abatimentosRes.error && abatimentosRes.data) {
      const mapa: Record<number, number> = {};
      for (const ab of abatimentosRes.data as any[]) {
        mapa[ab.cliente_id] = (mapa[ab.cliente_id] || 0) + Number(ab.valor);
      }
      setAbatimentosPorCliente(mapa);
    }
    
    setLoading(false);
  };

  const abrirDetalhesCliente = async (cliente: ClienteDebito) => {
    setSelectedCliente(cliente);
    
    const [comprasRes, abatimentosRes] = await Promise.all([
      supabase
        .from("compras")
        .select("id, criado_em, valor_total, mes_referencia, forma_pagamento" as any)
        .eq("cliente_id", cliente.cliente_id)
        .eq("paga", false)
        .order("criado_em", { ascending: false }),
      supabase
        .from("abatimentos" as any)
        .select("id, valor, criado_em")
        .eq("cliente_id", cliente.cliente_id)
        .order("criado_em", { ascending: false }),
    ]);
    
    if (comprasRes.error) {
      toast.error("Erro ao carregar compras");
      return;
    }
    
    setComprasCliente((comprasRes.data || []) as unknown as Compra[]);
    setAbatimentosCliente((abatimentosRes.data || []) as unknown as Abatimento[]);
    setShowDetalhes(true);
  };

  const abrirItensCompra = async (compra: Compra) => {
    setSelectedCompra(compra);
    
    const { data, error } = await supabase
      .from("itens_compra")
      .select("*, produto:produtos(nome, quantidade_atual)")
      .eq("compra_id", compra.id);
    
    if (error) {
      toast.error("Erro ao carregar itens");
      return;
    }
    
    setItensCompra(data || []);
    setShowItens(true);
  };

  const marcarMesPago = async () => {
    if (!selectedCliente || !confirmPagarMes) return;
    
    const { data, error } = await supabase.rpc("admin_marcar_pago_mes" as any, {
      p_cliente_id: selectedCliente.cliente_id,
      p_mes_referencia: confirmPagarMes,
    });
    
    setConfirmPagarMes(null);
    
    if (error) {
      toast.error("Erro ao marcar como pago");
    } else {
      const resultado = data as { ok: boolean; compras_marcadas: number };
      toast.success(`${resultado.compras_marcadas} compra(s) marcada(s) como paga(s)`);
      setShowDetalhes(false);
      loadDebitos();
    }
  };

  const marcarAtrasadasPagas = async () => {
    if (!selectedCliente) return;
    
    const { data, error } = await supabase.rpc("admin_marcar_atrasadas_pagas" as any, {
      p_cliente_id: selectedCliente.cliente_id,
    });
    
    setConfirmPagarAtrasadas(false);
    
    if (error) {
      toast.error("Erro ao marcar como pago");
    } else {
      const resultado = data as { ok: boolean; compras_marcadas: number };
      toast.success(`${resultado.compras_marcadas} compra(s) atrasada(s) marcada(s) como paga(s)`);
      setShowDetalhes(false);
      loadDebitos();
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
      const resultado = data as { ok: boolean; compra_removida?: boolean; novo_total?: number };
      if (resultado.compra_removida) {
        toast.success("Item estornado e compra removida");
        setShowItens(false);
        setShowDetalhes(false);
        loadDebitos();
        if (showVisitantes) loadComprasVisitante();
      } else {
        toast.success("Item estornado com sucesso");
        if (selectedCompra) {
          abrirItensCompra({ ...selectedCompra, valor_total: resultado.novo_total || 0 });
        }
      }
    }
  };

  const handleEstornoCompraCompleta = async () => {
    if (!selectedCompra) return;

    const result = await estornarCompraCompleta(
      selectedCompra.id,
      estornoComDevolucao,
      null
    );
    
    setConfirmEstornoCompra(false);

    if (result.ok) {
      toast.success("Compra estornada com sucesso");
      setShowItens(false);
      setShowDetalhes(false);
      loadDebitos();
      if (showVisitantes) loadComprasVisitante();
    } else {
      toast.error(result.error || "Erro ao estornar compra");
    }
  };

  const salvarAbatimento = async () => {
    if (!selectedCliente || abatimentoValor <= 0) return;
    setSalvandoAbatimento(true);

    const { error } = await supabase.from("abatimentos" as any).insert({
      cliente_id: selectedCliente.cliente_id,
      valor: abatimentoValor,
    } as any);

    setSalvandoAbatimento(false);
    setShowAbatimento(false);
    setAbatimentoValor(0);

    if (error) {
      toast.error("Erro ao registrar abatimento");
    } else {
      toast.success("Abatimento registrado com sucesso");
      await loadDebitos();
      abrirDetalhesCliente(selectedCliente);
    }
  };

  const loadComprasVisitante = async () => {
    setLoadingVisitantes(true);
    
    const { data, error } = await supabase
      .from("compras")
      .select("id, criado_em, valor_total, mes_referencia, forma_pagamento, eh_visitante")
      .eq("eh_visitante", true)
      .eq("paga", false)
      .order("criado_em", { ascending: false });
    
    if (error) {
      toast.error("Erro ao carregar compras de visitante");
    } else {
      setComprasVisitante((data || []) as Compra[]);
    }
    
    setLoadingVisitantes(false);
  };

  const abrirVisitantes = async () => {
    await loadComprasVisitante();
    setShowVisitantes(true);
  };

  const abrirItensVisitante = async (compra: Compra) => {
    setSelectedCompra(compra);
    
    const { data, error } = await supabase
      .from("itens_compra")
      .select("*, produto:produtos(nome, quantidade_atual)")
      .eq("compra_id", compra.id);
    
    if (error) {
      toast.error("Erro ao carregar itens");
      return;
    }
    
    setItensCompra(data || []);
    setShowItens(true);
  };

  const formatarData = (iso: string) => {
    try {
      return format(new Date(iso), "dd/MM/yyyy HH:mm");
    } catch {
      return iso;
    }
  };

  const clientesFiltrados = debitos?.clientes.filter((c) =>
    c.cliente_nome.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const clientesComDebito = clientesFiltrados.filter((c) => {
    const totalCaderneta = c.total_mes_atual + c.total_mes_anterior + c.total_atrasado;
    const totalAbatido = abatimentosPorCliente[c.cliente_id] || 0;
    const totalDevido = totalCaderneta - totalAbatido;
    return totalDevido > 0 || c.total_pix > 0;
  });

  // Totais do detalhe do cliente
  const totalCadernetaCliente = selectedCliente
    ? (selectedCliente.total_mes_atual + selectedCliente.total_mes_anterior + selectedCliente.total_atrasado)
    : 0;
  const totalAbatimentosCliente = abatimentosCliente.reduce((s, a) => s + Number(a.valor), 0);
  const totalDevidoCliente = Math.max(totalCadernetaCliente - totalAbatimentosCliente, 0);
  const totalPixCliente = selectedCliente?.total_pix || 0;

  // Separar compras por tipo no detalhe
  const comprasCadernetaCliente = comprasCliente.filter(c => c.forma_pagamento !== "pix");
  const comprasPixCliente = comprasCliente.filter(c => c.forma_pagamento === "pix");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton to="/admin" />
            <h1 className="text-3xl font-bold">Cadernetas</h1>
          </div>
          <Button variant="outline" onClick={abrirVisitantes}>
            <Users className="h-4 w-4 mr-2" />
            Compras de Visitante
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Resumo dos Débitos</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Mês atual: <strong>{debitos?.mes_atual}</strong></p>
            <p>Mês anterior: <strong>{debitos?.mes_anterior}</strong></p>
          </CardContent>
        </Card>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12"
          />
        </div>

        {clientesComDebito.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhum cliente com débito em aberto.
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total Devido</TableHead>
                  <TableHead className="text-right">Compras PIX</TableHead>
                  <TableHead className="text-right">Abatido</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesComDebito.map((cliente) => {
                  const totalCaderneta = cliente.total_mes_atual + cliente.total_mes_anterior + cliente.total_atrasado;
                  const totalAbatido = abatimentosPorCliente[cliente.cliente_id] || 0;
                  const totalDevido = Math.max(totalCaderneta - totalAbatido, 0);
                  return (
                    <TableRow
                      key={cliente.cliente_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/admin/cadernetas/${cliente.cliente_id}`)}
                    >
                      <TableCell className="font-medium">{cliente.cliente_nome}</TableCell>
                      <TableCell className="text-right font-bold">
                        {totalDevido > 0 ? `R$ ${totalDevido.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-emerald-700">
                        {cliente.total_pix > 0 ? `R$ ${Number(cliente.total_pix).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {totalAbatido > 0 ? `-R$ ${totalAbatido.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Modal Detalhes do Cliente */}
      <Dialog open={showDetalhes} onOpenChange={setShowDetalhes}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compras de {selectedCliente?.cliente_nome}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            {/* Resumo financeiro */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Total devido</p>
                <p className="text-xl font-bold">R$ {totalDevidoCliente.toFixed(2)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-xs text-emerald-600">Compras no PIX</p>
                <p className="text-xl font-bold text-emerald-700">R$ {totalPixCliente.toFixed(2)}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xs text-green-600">Total abatido</p>
                <p className="text-xl font-bold text-green-700">-R$ {totalAbatimentosCliente.toFixed(2)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div />
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  setAbatimentoValor(0);
                  setShowAbatimento(true);
                }}
              >
                <MinusCircle className="h-4 w-4 mr-2" />
                Abater valor
              </Button>
            </div>

            {/* Ações rápidas */}
            <div className="flex flex-wrap gap-2">
              {selectedCliente && selectedCliente.total_mes_anterior > 0 && (
                <Button
                  variant="outline"
                  className="bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                  onClick={() => setConfirmPagarMes(debitos?.mes_anterior || null)}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Marcar mês anterior como pago
                </Button>
              )}
              
              {selectedCliente && selectedCliente.total_atrasado > 0 && (
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

            {/* Abatimentos registrados */}
            {abatimentosCliente.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Abatimentos</h3>
                {abatimentosCliente.map((ab) => (
                  <div key={ab.id} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                    <span className="text-sm text-green-700">{formatarData(ab.criado_em)}</span>
                    <span className="font-semibold text-green-700">-R$ {Number(ab.valor).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {comprasCliente.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhuma compra em aberto.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Mês Ref.</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comprasCliente.map((compra) => (
                    <TableRow key={compra.id}>
                      <TableCell>{formatarData(compra.criado_em)}</TableCell>
                      <TableCell>{compra.mes_referencia}</TableCell>
                      <TableCell>
                        <PaymentBadge formaPagamento={compra.forma_pagamento} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        R$ {Number(compra.valor_total).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => abrirItensCompra(compra)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Abatimento */}
      <Dialog open={showAbatimento} onOpenChange={setShowAbatimento}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Abater valor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Informe o valor a abater da dívida de <strong>{selectedCliente?.cliente_nome}</strong>.
            </p>
            <MoneyInput
              value={abatimentoValor}
              onChange={setAbatimentoValor}
            />
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

      {/* Modal Compras de Visitante */}
      <Dialog open={showVisitantes} onOpenChange={setShowVisitantes}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compras de Visitante (não pagas)</DialogTitle>
          </DialogHeader>
          
          <div className="pt-4">
            {loadingVisitantes ? (
              <p className="text-center py-8">Carregando...</p>
            ) : comprasVisitante.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhuma compra de visitante em aberto.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Mês Ref.</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comprasVisitante.map((compra) => (
                    <TableRow key={compra.id}>
                      <TableCell>#{compra.id}</TableCell>
                      <TableCell>{formatarData(compra.criado_em)}</TableCell>
                      <TableCell>{compra.mes_referencia}</TableCell>
                      <TableCell>
                        <PaymentBadge formaPagamento={compra.forma_pagamento} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        R$ {Number(compra.valor_total).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => abrirItensVisitante(compra)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Itens da Compra */}
      <Dialog open={showItens} onOpenChange={setShowItens}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Itens da Compra #{selectedCompra?.id}</DialogTitle>
          </DialogHeader>
          
          <div className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead className="text-right">Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensCompra.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.produto?.nome || "-"}</TableCell>
                    <TableCell className="text-center">{item.quantidade}</TableCell>
                    <TableCell className="text-right">R$ {Number(item.valor_unitario).toFixed(2)}</TableCell>
                    <TableCell className="text-right">R$ {Number(item.valor_total).toFixed(2)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setItemParaEstornar(item);
                          setEstornoComDevolucao(true);
                        }}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            <div className="mt-4 flex justify-between items-center pt-4 border-t">
              <span className="text-xl font-bold">
                Total: R$ {Number(selectedCompra?.valor_total || 0).toFixed(2)}
              </span>
              <Button
                variant="destructive"
                onClick={() => setConfirmEstornoCompra(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Estornar compra completa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação Marcar Mês Pago */}
      <AlertDialog open={!!confirmPagarMes} onOpenChange={() => setConfirmPagarMes(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as compras do mês <strong>{confirmPagarMes}</strong> de {selectedCliente?.cliente_nome} serão marcadas como pagas.
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
              Todas as compras atrasadas (meses anteriores) de {selectedCliente?.cliente_nome} serão marcadas como pagas.
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
            <AlertDialogAction onClick={handleEstornoCompraCompleta}>
              Confirmar Estorno
            </AlertDialogAction>
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

export default AdminCadernetas;

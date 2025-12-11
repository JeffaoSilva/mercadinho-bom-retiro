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
import { ArrowLeft, Search, Eye, CheckCircle, RotateCcw, Trash2, Users } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { estornarCompraCompleta } from "@/services/estornos";
import { format } from "date-fns";

interface ClienteDebito {
  cliente_id: number;
  cliente_nome: string;
  total_mes_atual: number;
  total_mes_anterior: number;
  total_atrasado: number;
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

const AdminCadernetas = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  
  const [debitos, setDebitos] = useState<DebitosPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Modal de detalhes do cliente
  const [selectedCliente, setSelectedCliente] = useState<ClienteDebito | null>(null);
  const [comprasCliente, setComprasCliente] = useState<Compra[]>([]);
  const [showDetalhes, setShowDetalhes] = useState(false);
  
  // Modal de itens da compra
  const [selectedCompra, setSelectedCompra] = useState<Compra | null>(null);
  const [itensCompra, setItensCompra] = useState<ItemCompra[]>([]);
  const [showItens, setShowItens] = useState(false);
  
  // Confirmações
  const [confirmPagarMes, setConfirmPagarMes] = useState<string | null>(null);
  const [confirmPagarAtrasadas, setConfirmPagarAtrasadas] = useState(false);
  
  // Estorno de item
  const [itemParaEstornar, setItemParaEstornar] = useState<ItemCompra | null>(null);
  const [estornoComDevolucao, setEstornoComDevolucao] = useState(true);

  // Estorno de compra completa
  const [confirmEstornoCompra, setConfirmEstornoCompra] = useState(false);

  // Compras de visitante
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
    
    const { data, error } = await supabase.rpc("admin_listar_clientes_debitos" as any);
    
    if (error) {
      console.error("Erro ao carregar débitos", error);
      toast.error("Erro ao carregar dados");
    } else {
      setDebitos(data as unknown as DebitosPayload);
    }
    
    setLoading(false);
  };

  const abrirDetalhesCliente = async (cliente: ClienteDebito) => {
    setSelectedCliente(cliente);
    
    const { data, error } = await supabase
      .from("compras")
      .select("id, criado_em, valor_total, mes_referencia, forma_pagamento" as any)
      .eq("cliente_id", cliente.cliente_id)
      .eq("paga", false)
      .order("criado_em", { ascending: false });
    
    if (error) {
      toast.error("Erro ao carregar compras");
      return;
    }
    
    setComprasCliente((data || []) as unknown as Compra[]);
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
        // Se estava vendo visitantes, recarrega também
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
    if (!selectedCompra || itensCompra.length === 0) return;

    const result = await estornarCompraCompleta(selectedCompra.id, itensCompra);
    
    setConfirmEstornoCompra(false);

    if (result.ok) {
      toast.success("Compra estornada com sucesso");
      setShowItens(false);
      setShowDetalhes(false);
      loadDebitos();
      // Se estava vendo visitantes, recarrega também
      if (showVisitantes) loadComprasVisitante();
    } else {
      toast.error(result.error || "Erro ao estornar compra");
    }
  };

  // Compras de visitante
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

  const clientesComDebito = clientesFiltrados.filter(
    (c) => c.total_mes_atual > 0 || c.total_mes_anterior > 0 || c.total_atrasado > 0
  );

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
            <Button variant="outline" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
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
                  <TableHead className="text-right">Mês Atual</TableHead>
                  <TableHead className="text-right">Mês Anterior</TableHead>
                  <TableHead className="text-right">Atrasado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesComDebito.map((cliente) => {
                  const total = cliente.total_mes_atual + cliente.total_mes_anterior + cliente.total_atrasado;
                  return (
                    <TableRow key={cliente.cliente_id}>
                      <TableCell className="font-medium">{cliente.cliente_nome}</TableCell>
                      <TableCell className="text-right">
                        {cliente.total_mes_atual > 0 ? `R$ ${Number(cliente.total_mes_atual).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {cliente.total_mes_anterior > 0 ? `R$ ${Number(cliente.total_mes_anterior).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {cliente.total_atrasado > 0 ? `R$ ${Number(cliente.total_atrasado).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        R$ {total.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => abrirDetalhesCliente(cliente)}>
                          <Eye className="h-4 w-4" />
                        </Button>
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

            {comprasCliente.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhuma compra em aberto.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Mês Ref.</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comprasCliente.map((compra) => (
                    <TableRow key={compra.id}>
                      <TableCell>{formatarData(compra.criado_em)}</TableCell>
                      <TableCell>{compra.mes_referencia}</TableCell>
                      <TableCell className="capitalize">{compra.forma_pagamento}</TableCell>
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

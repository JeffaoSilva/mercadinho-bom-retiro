import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, Search, Trash2, X } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { format } from "date-fns";

interface Compra {
  id: number;
  cliente_id: number | null;
  eh_visitante: boolean;
  valor_total: number;
  data_compra: string;
  cliente?: { nome: string };
}

interface ItemCompra {
  id: number;
  produto_id: number;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  produto?: { nome: string; quantidade_atual: number };
}

const AdminEstornos = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showItens, setShowItens] = useState(false);
  const [selectedCompra, setSelectedCompra] = useState<Compra | null>(null);
  const [itensCompra, setItensCompra] = useState<ItemCompra[]>([]);
  const [confirmEstorno, setConfirmEstorno] = useState(false);
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<ItemCompra | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadCompras();
  }, [isAuthenticated, authLoading, navigate]);

  const loadCompras = async () => {
    const { data, error } = await supabase
      .from("compras")
      .select("*, cliente:clientes(nome)")
      .order("data_compra", { ascending: false })
      .limit(100);

    if (error) {
      toast.error("Erro ao carregar compras");
      return;
    }
    setCompras(data || []);
    setLoading(false);
  };

  const loadItens = async (compraId: number) => {
    const { data, error } = await supabase
      .from("itens_compra")
      .select("*, produto:produtos(nome, quantidade_atual)")
      .eq("compra_id", compraId);

    if (error) {
      toast.error("Erro ao carregar itens");
      return;
    }
    setItensCompra(data || []);
  };

  const openItens = async (compra: Compra) => {
    setSelectedCompra(compra);
    await loadItens(compra.id);
    setShowItens(true);
  };

  const filteredCompras = compras.filter((c) => {
    const clienteNome = c.eh_visitante ? "VISITANTE" : c.cliente?.nome || "";
    return clienteNome.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toString().includes(search);
  });

  const estornarCompraCompleta = async () => {
    if (!selectedCompra) return;

    try {
      // Reverter estoque de cada item
      for (const item of itensCompra) {
        if (item.produto) {
          await supabase
            .from("produtos")
            .update({
              quantidade_atual: item.produto.quantidade_atual + item.quantidade,
            })
            .eq("id", item.produto_id);
        }
      }

      // Deletar itens
      await supabase.from("itens_compra").delete().eq("compra_id", selectedCompra.id);

      // Deletar compra
      await supabase.from("compras").delete().eq("id", selectedCompra.id);

      toast.success("Compra estornada com sucesso");
      setConfirmEstorno(false);
      setShowItens(false);
      loadCompras();
    } catch (error) {
      toast.error("Erro ao estornar compra");
    }
  };

  const removerItem = async () => {
    if (!selectedCompra || !confirmRemoveItem) return;

    try {
      // Reverter estoque
      if (confirmRemoveItem.produto) {
        await supabase
          .from("produtos")
          .update({
            quantidade_atual:
              confirmRemoveItem.produto.quantidade_atual + confirmRemoveItem.quantidade,
          })
          .eq("id", confirmRemoveItem.produto_id);
      }

      // Deletar item
      await supabase.from("itens_compra").delete().eq("id", confirmRemoveItem.id);

      // Recalcular total da compra
      const novoTotal = selectedCompra.valor_total - confirmRemoveItem.valor_total;

      if (novoTotal <= 0) {
        // Se não sobrar nenhum item, deletar a compra
        await supabase.from("compras").delete().eq("id", selectedCompra.id);
        toast.success("Item removido e compra estornada");
        setShowItens(false);
        loadCompras();
      } else {
        await supabase
          .from("compras")
          .update({ valor_total: novoTotal })
          .eq("id", selectedCompra.id);

        setSelectedCompra({ ...selectedCompra, valor_total: novoTotal });
        await loadItens(selectedCompra.id);
        toast.success("Item removido");
      }

      setConfirmRemoveItem(null);
    } catch (error) {
      toast.error("Erro ao remover item");
    }
  };

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
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold">Estornos</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou ID da compra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12"
          />
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompras.map((compra) => (
                <TableRow key={compra.id}>
                  <TableCell>#{compra.id}</TableCell>
                  <TableCell>
                    {format(new Date(compra.data_compra), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    {compra.eh_visitante ? "VISITANTE" : compra.cliente?.nome || "-"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    R$ {compra.valor_total.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button variant="destructive" size="sm" onClick={() => openItens(compra)}>
                      Estornar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog Itens */}
      <Dialog open={showItens} onOpenChange={setShowItens}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Estornar Compra #{selectedCompra?.id}</DialogTitle>
          </DialogHeader>
          <div className="pt-4 space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensCompra.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.produto?.nome || "-"}</TableCell>
                    <TableCell className="text-center">{item.quantidade}</TableCell>
                    <TableCell className="text-right">
                      R$ {item.valor_total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmRemoveItem(item)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex justify-between items-center pt-4 border-t">
              <span className="text-xl font-bold">
                Total: R$ {selectedCompra?.valor_total.toFixed(2)}
              </span>
              <Button variant="destructive" onClick={() => setConfirmEstorno(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Estornar Compra Completa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação Estorno Completo */}
      <AlertDialog open={confirmEstorno} onOpenChange={setConfirmEstorno}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar estorno completo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação vai cancelar a compra inteira e devolver os itens ao estoque.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={estornarCompraCompleta}>
              Confirmar Estorno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação Remover Item */}
      <AlertDialog
        open={!!confirmRemoveItem}
        onOpenChange={() => setConfirmRemoveItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover item?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai remover "{confirmRemoveItem?.produto?.nome}" da compra e devolver{" "}
              {confirmRemoveItem?.quantidade} unidade(s) ao estoque.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={removerItem}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminEstornos;

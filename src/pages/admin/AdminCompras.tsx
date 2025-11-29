import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Eye } from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import { format } from "date-fns";

interface Compra {
  id: number;
  cliente_id: number | null;
  mercadinho_id: number;
  eh_visitante: boolean;
  tipo_pagamento: string;
  valor_total: number;
  data_compra: string;
  cliente?: { nome: string };
  mercadinho?: { nome: string };
}

interface ItemCompra {
  id: number;
  produto_id: number;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  produto?: { nome: string };
}

interface Cliente {
  id: number;
  nome: string;
}

interface Mercadinho {
  id: number;
  nome: string;
}

const AdminCompras = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAdmin();
  const [compras, setCompras] = useState<Compra[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mercadinhos, setMercadinhos] = useState<Mercadinho[]>([]);
  const [loading, setLoading] = useState(true);
  const [showItens, setShowItens] = useState(false);
  const [selectedCompra, setSelectedCompra] = useState<Compra | null>(null);
  const [itensCompra, setItensCompra] = useState<ItemCompra[]>([]);

  const [filtros, setFiltros] = useState({
    cliente_id: "",
    mercadinho_id: "",
    tipo_pagamento: "",
    mes: "",
  });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadData();
  }, [isAuthenticated, navigate]);

  const loadData = async () => {
    const [comprasRes, clientesRes, mercadinhosRes] = await Promise.all([
      supabase
        .from("compras")
        .select("*, cliente:clientes(nome), mercadinho:mercadinhos(nome)")
        .order("data_compra", { ascending: false })
        .limit(100),
      supabase.from("clientes").select("id, nome").order("nome"),
      supabase.from("mercadinhos").select("id, nome").order("nome"),
    ]);

    if (comprasRes.error || clientesRes.error || mercadinhosRes.error) {
      toast.error("Erro ao carregar dados");
      return;
    }

    setCompras(comprasRes.data || []);
    setClientes(clientesRes.data || []);
    setMercadinhos(mercadinhosRes.data || []);
    setLoading(false);
  };

  const loadItens = async (compraId: number) => {
    const { data, error } = await supabase
      .from("itens_compra")
      .select("*, produto:produtos(nome)")
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
    if (filtros.cliente_id && c.cliente_id?.toString() !== filtros.cliente_id) return false;
    if (filtros.mercadinho_id && c.mercadinho_id.toString() !== filtros.mercadinho_id) return false;
    if (filtros.tipo_pagamento && c.tipo_pagamento !== filtros.tipo_pagamento) return false;
    if (filtros.mes) {
      const compraMonth = format(new Date(c.data_compra), "yyyy-MM");
      if (compraMonth !== filtros.mes) return false;
    }
    return true;
  });

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
          <h1 className="text-3xl font-bold">Compras / Cadernetas</h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label>Cliente</Label>
            <Select
              value={filtros.cliente_id}
              onValueChange={(v) => setFiltros({ ...filtros, cliente_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mercadinho</Label>
            <Select
              value={filtros.mercadinho_id}
              onValueChange={(v) => setFiltros({ ...filtros, mercadinho_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                {mercadinhos.map((m) => (
                  <SelectItem key={m.id} value={m.id.toString()}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo Pagamento</Label>
            <Select
              value={filtros.tipo_pagamento}
              onValueChange={(v) => setFiltros({ ...filtros, tipo_pagamento: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                <SelectItem value="caderneta">Caderneta</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mês</Label>
            <Input
              type="month"
              value={filtros.mes}
              onChange={(e) => setFiltros({ ...filtros, mes: e.target.value })}
            />
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Mercadinho</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompras.map((compra) => (
                <TableRow key={compra.id}>
                  <TableCell>
                    {format(new Date(compra.data_compra), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    {compra.eh_visitante ? "VISITANTE" : compra.cliente?.nome || "-"}
                  </TableCell>
                  <TableCell>{compra.mercadinho?.nome || "-"}</TableCell>
                  <TableCell className="capitalize">{compra.tipo_pagamento}</TableCell>
                  <TableCell className="text-right font-semibold">
                    R$ {compra.valor_total.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openItens(compra)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={showItens} onOpenChange={setShowItens}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Itens da Compra #{selectedCompra?.id}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead className="text-right">Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensCompra.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.produto?.nome || "-"}</TableCell>
                    <TableCell className="text-center">{item.quantidade}</TableCell>
                    <TableCell className="text-right">
                      R$ {item.valor_unitario.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      R$ {item.valor_total.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 text-right text-xl font-bold">
              Total: R$ {selectedCompra?.valor_total.toFixed(2)}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCompras;

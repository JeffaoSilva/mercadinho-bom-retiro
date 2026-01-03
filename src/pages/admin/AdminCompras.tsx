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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Eye } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
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
  const { isAuthenticated, loading: authLoading } = useAdminAuth();

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
    if (authLoading) return;

    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }

    loadData();
  }, [isAuthenticated, authLoading, navigate]);

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
    return <div>Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => navigate("/admin")}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar
      </Button>

      <h1 className="text-2xl font-bold">Compras / Cadernetas</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label>Cliente</Label>
          <Select
            value={filtros.cliente_id || "all"}
            onValueChange={(v) =>
              setFiltros({ ...filtros, cliente_id: v === "all" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
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
            value={filtros.mercadinho_id || "all"}
            onValueChange={(v) =>
              setFiltros({ ...filtros, mercadinho_id: v === "all" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
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
            value={filtros.tipo_pagamento || "all"}
            onValueChange={(v) =>
              setFiltros({ ...filtros, tipo_pagamento: v === "all" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Mercadinho</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead>Total</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {filteredCompras.map((compra) => (
            <TableRow key={compra.id}>
              <TableCell>{format(new Date(compra.data_compra), "dd/MM/yyyy HH:mm")}</TableCell>
              <TableCell>
                {compra.eh_visitante ? "VISITANTE" : compra.cliente?.nome || "-"}
              </TableCell>
              <TableCell>{compra.mercadinho?.nome || "-"}</TableCell>
              <TableCell>{compra.tipo_pagamento}</TableCell>
              <TableCell>R$ {compra.valor_total.toFixed(2)}</TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => openItens(compra)}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={showItens} onOpenChange={setShowItens}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Itens da Compra #{selectedCompra?.id}</DialogTitle>
          </DialogHeader>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Qtd</TableHead>
                <TableHead>Unit.</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {itensCompra.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.produto?.nome || "-"}</TableCell>
                  <TableCell>{item.quantidade}</TableCell>
                  <TableCell>R$ {item.valor_unitario.toFixed(2)}</TableCell>
                  <TableCell>R$ {item.valor_total.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="text-right font-bold">
            Total: R$ {selectedCompra?.valor_total.toFixed(2)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCompras;

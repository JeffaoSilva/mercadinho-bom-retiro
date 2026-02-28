import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ArrowLeft, Plus, Pencil, Key, History, Search } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { format } from "date-fns";

interface Cliente {
  id: number;
  nome: string;
  telefone: string;
  mercadinho_id: number;
  criado_em: string;
  ativo: boolean;
  mercadinho?: { nome: string };
}

interface Compra {
  id: number;
  data_compra: string;
  valor_total: number;
  tipo_pagamento: string;
}

interface Mercadinho {
  id: number;
  nome: string;
}

const AdminClientes = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mercadinhos, setMercadinhos] = useState<Mercadinho[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [historico, setHistorico] = useState<Compra[]>([]);
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    mercadinho_id: "",
    ativo: true,
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
    const [clientesRes, mercadinhosRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("*, mercadinho:mercadinhos(nome)")
        .order("ativo", { ascending: false })
        .order("nome"),
      supabase.from("mercadinhos").select("id, nome").order("nome"),
    ]);

    if (clientesRes.error || mercadinhosRes.error) {
      toast.error("Erro ao carregar dados");
      return;
    }

    setClientes(clientesRes.data || []);
    setMercadinhos(mercadinhosRes.data || []);
    setLoading(false);
  };

  const loadHistorico = async (clienteId: number) => {
    const { data, error } = await supabase
      .from("compras")
      .select("id, data_compra, valor_total, tipo_pagamento")
      .eq("cliente_id", clienteId)
      .order("data_compra", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar histórico");
      return;
    }
    setHistorico(data || []);
  };

  const filteredClientes = clientes.filter((c) =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone.includes(search)
  );

  const clientesAtivos = filteredClientes.filter((c) => c.ativo);
  const clientesInativos = filteredClientes.filter((c) => !c.ativo);

  const openNew = () => {
    setEditingCliente(null);
    setForm({ nome: "", telefone: "", mercadinho_id: "", ativo: true });
    setShowDialog(true);
  };

  const openEdit = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setForm({
      nome: cliente.nome,
      telefone: cliente.telefone,
      mercadinho_id: cliente.mercadinho_id.toString(),
      ativo: cliente.ativo,
    });
    setShowDialog(true);
  };

  const openHistorico = async (cliente: Cliente) => {
    setSelectedCliente(cliente);
    await loadHistorico(cliente.id);
    setShowHistorico(true);
  };

  const handleSave = async () => {
    if (!form.nome || !form.telefone || !form.mercadinho_id) {
      toast.error("Preencha todos os campos");
      return;
    }

    const payload = {
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      mercadinho_id: parseInt(form.mercadinho_id),
      ativo: form.ativo,
    };

    if (editingCliente) {
      const { error } = await supabase
        .from("clientes")
        .update(payload)
        .eq("id", editingCliente.id);

      if (error) {
        toast.error("Erro ao atualizar cliente");
        return;
      }
      toast.success("Cliente atualizado");
    } else {
      const { error } = await supabase.from("clientes").insert(payload);

      if (error) {
        toast.error("Erro ao criar cliente");
        return;
      }
      toast.success("Cliente criado");
    }

    setShowDialog(false);
    loadData();
  };

  const resetarPin = async (cliente: Cliente) => {
    const { error } = await supabase
      .from("pins")
      .delete()
      .eq("cliente_id", cliente.id);

    if (error) {
      toast.error("Erro ao resetar PIN");
      return;
    }
    toast.success("PIN resetado com sucesso");
  };

  const renderClienteRow = (cliente: Cliente) => (
    <TableRow key={cliente.id} className={!cliente.ativo ? "opacity-50" : ""}>
      <TableCell className="font-medium">{cliente.nome}</TableCell>
      <TableCell>{cliente.telefone}</TableCell>
      <TableCell>{cliente.mercadinho?.nome || "-"}</TableCell>
      <TableCell>
        {format(new Date(cliente.criado_em), "dd/MM/yyyy")}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openEdit(cliente)}
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => resetarPin(cliente)}
            title="Resetar PIN"
          >
            <Key className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openHistorico(cliente)}
            title="Histórico"
          >
            <History className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
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
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">Clientes</h1>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-5 w-5" />
            Novo Cliente
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12"
          />
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Mercadinho</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientesAtivos.map(renderClienteRow)}
              {clientesInativos.length > 0 && (
                <>
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-sm font-semibold text-muted-foreground bg-muted/50 py-2"
                    >
                      — Clientes Inativos —
                    </TableCell>
                  </TableRow>
                  {clientesInativos.map(renderClienteRow)}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog Edição */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCliente ? "Editar Cliente" : "Novo Cliente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <Label>Telefone *</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>
            <div>
              <Label>Mercadinho *</Label>
              <Select
                value={form.mercadinho_id}
                onValueChange={(v) => setForm({ ...form, mercadinho_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {mercadinhos.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingCliente && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ativo"
                  checked={form.ativo}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, ativo: checked === true })
                  }
                />
                <Label htmlFor="ativo" className="cursor-pointer">Ativo</Label>
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDialog(false)}
              >
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleSave}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Histórico */}
      <Dialog open={showHistorico} onOpenChange={setShowHistorico}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico - {selectedCliente?.nome}</DialogTitle>
          </DialogHeader>
          <div className="pt-4">
            {historico.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma compra registrada
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((compra) => (
                    <TableRow key={compra.id}>
                      <TableCell>
                        {format(new Date(compra.data_compra), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="capitalize">
                        {compra.tipo_pagamento}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        R$ {compra.valor_total.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminClientes;

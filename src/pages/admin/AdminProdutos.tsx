import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { ArrowLeft, Plus, Pencil, Search, Camera } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import CameraScanner from "@/components/CameraScanner";
import { playBeep } from "@/utils/beep";

interface Produto {
  id: number;
  nome: string;
  codigo_barras: string | null;
  preco_compra: number;
  preco_venda: number;
  ativo: boolean;
  quantidade_atual: number;
  quantidade_total: number;
}

const AdminProdutos = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    codigo_barras: "",
    preco_compra: "",
    preco_venda: "",
    ativo: true,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadProdutos();
  }, [isAuthenticated, authLoading, navigate]);

  const loadProdutos = async () => {
    // Buscar produtos
    const { data: produtosData, error: produtosError } = await supabase
      .from("produtos")
      .select("*")
      .order("nome");

    if (produtosError) {
      toast.error("Erro ao carregar produtos");
      return;
    }

    // Buscar soma de quantidade_prateleira por produto_id
    const { data: prateleirasData } = await supabase
      .from("prateleiras_produtos")
      .select("produto_id, quantidade_prateleira");

    // Montar mapa de soma por produto_id
    const somaPrateleiras = new Map<number, number>();
    for (const p of prateleirasData || []) {
      const atual = somaPrateleiras.get(p.produto_id) || 0;
      somaPrateleiras.set(p.produto_id, atual + p.quantidade_prateleira);
    }

    // Adicionar quantidade_total a cada produto
    const produtosComTotal = (produtosData || []).map((prod) => ({
      ...prod,
      quantidade_total: prod.quantidade_atual + (somaPrateleiras.get(prod.id) || 0),
    }));

    setProdutos(produtosComTotal);
    setLoading(false);
  };

  const filteredProdutos = produtos.filter(
    (p) =>
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.codigo_barras && p.codigo_barras.includes(search))
  );

  const openNew = () => {
    setEditingProduto(null);
    setForm({ nome: "", codigo_barras: "", preco_compra: "", preco_venda: "", ativo: true });
    setShowDialog(true);
  };

  const openEdit = (produto: Produto) => {
    setEditingProduto(produto);
    setForm({
      nome: produto.nome,
      codigo_barras: produto.codigo_barras || "",
      preco_compra: produto.preco_compra.toString(),
      preco_venda: produto.preco_venda.toString(),
      ativo: produto.ativo,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.nome || !form.preco_compra || !form.preco_venda) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    const payload = {
      nome: form.nome.trim(),
      codigo_barras: form.codigo_barras.trim() || null,
      preco_compra: parseFloat(form.preco_compra),
      preco_venda: parseFloat(form.preco_venda),
      ativo: form.ativo,
    };

    if (editingProduto) {
      const { error } = await supabase
        .from("produtos")
        .update(payload)
        .eq("id", editingProduto.id);

      if (error) {
        toast.error("Erro ao atualizar produto");
        return;
      }
      toast.success("Produto atualizado");
    } else {
      const { error } = await supabase.from("produtos").insert(payload);

      if (error) {
        toast.error("Erro ao criar produto");
        return;
      }
      toast.success("Produto criado");
    }

    setShowDialog(false);
    loadProdutos();
  };

  const toggleAtivo = async (produto: Produto) => {
    const { error } = await supabase
      .from("produtos")
      .update({ ativo: !produto.ativo })
      .eq("id", produto.id);

    if (error) {
      toast.error("Erro ao atualizar status");
      return;
    }
    loadProdutos();
  };

  // Handler para código detectado pela câmera
  const handleCameraDetected = (code: string) => {
    setShowCameraScanner(false);
    setForm({ ...form, codigo_barras: code });
    playBeep();
    toast.success("Código lido: " + code);
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
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">Produtos</h1>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-5 w-5" />
            Novo Produto
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código de barras..."
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
                <TableHead>Código</TableHead>
                <TableHead className="text-right">Compra</TableHead>
                <TableHead className="text-right">Venda</TableHead>
                <TableHead className="text-right">Qtd Total</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProdutos.map((produto) => (
                <TableRow key={produto.id}>
                  <TableCell className="font-medium">{produto.nome}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {produto.codigo_barras || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    R$ {produto.preco_compra.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    R$ {produto.preco_venda.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">{produto.quantidade_total}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={produto.ativo}
                      onCheckedChange={() => toggleAtivo(produto)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(produto)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProduto ? "Editar Produto" : "Novo Produto"}
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
              <Label>Código de Barras</Label>
              <div className="flex gap-2">
                <Input
                  value={form.codigo_barras}
                  onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowCameraScanner(true)}
                  title="Ler pela câmera"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Preço Compra *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.preco_compra}
                  onChange={(e) => setForm({ ...form, preco_compra: e.target.value })}
                />
              </div>
              <div>
                <Label>Preço Venda *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.preco_venda}
                  onChange={(e) => setForm({ ...form, preco_venda: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.ativo}
                onCheckedChange={(checked) => setForm({ ...form, ativo: checked })}
              />
              <Label>Produto ativo</Label>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleSave}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Scanner Modal */}
      {showCameraScanner && (
        <CameraScanner
          onDetected={handleCameraDetected}
          onClose={() => setShowCameraScanner(false)}
          title="Escaneie o código de barras"
        />
      )}
    </div>
  );
};

export default AdminProdutos;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { format } from "date-fns";

interface Promocao {
  id: number;
  nome: string;
  desconto_percentual: number;
  tipo: string;
  produto_id: number | null;
  inicia_em: string;
  termina_em: string | null;
  ativa: boolean;
  produto?: { nome: string };
}

interface Produto {
  id: number;
  nome: string;
}

const AdminPromocoes = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promocao | null>(null);
  const [form, setForm] = useState({
    nome: "",
    desconto_percentual: "",
    tipo: "global",
    produto_id: "",
    inicia_em: "",
    termina_em: "",
    ativa: true,
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
    const [promoRes, prodRes] = await Promise.all([
      supabase
        .from("promocoes")
        .select("*, produto:produtos(nome)")
        .order("criado_em", { ascending: false }),
      supabase.from("produtos").select("id, nome").eq("ativo", true).order("nome"),
    ]);

    if (promoRes.error) {
      toast.error("Erro ao carregar promoções");
      return;
    }
    if (prodRes.error) {
      toast.error("Erro ao carregar produtos");
      return;
    }

    setPromocoes(promoRes.data || []);
    setProdutos(prodRes.data || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditingPromo(null);
    setForm({
      nome: "",
      desconto_percentual: "",
      tipo: "global",
      produto_id: "",
      inicia_em: "",
      termina_em: "",
      ativa: true,
    });
    setShowDialog(true);
  };

  const openEdit = (promo: Promocao) => {
    setEditingPromo(promo);
    setForm({
      nome: promo.nome,
      desconto_percentual: promo.desconto_percentual.toString(),
      tipo: promo.tipo,
      produto_id: promo.produto_id?.toString() || "",
      inicia_em: promo.inicia_em.slice(0, 16),
      termina_em: promo.termina_em?.slice(0, 16) || "",
      ativa: promo.ativa,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.nome || !form.desconto_percentual || !form.inicia_em) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    if (form.tipo === "produto" && !form.produto_id) {
      toast.error("Selecione um produto");
      return;
    }

    const payload = {
      nome: form.nome.trim(),
      desconto_percentual: parseFloat(form.desconto_percentual),
      tipo: form.tipo,
      produto_id: form.tipo === "produto" ? parseInt(form.produto_id) : null,
      inicia_em: new Date(form.inicia_em).toISOString(),
      termina_em: form.termina_em ? new Date(form.termina_em).toISOString() : null,
      ativa: form.ativa,
    };

    if (editingPromo) {
      const { error } = await supabase
        .from("promocoes")
        .update(payload)
        .eq("id", editingPromo.id);

      if (error) {
        toast.error("Erro ao atualizar promoção");
        return;
      }
      toast.success("Promoção atualizada");
    } else {
      const { error } = await supabase.from("promocoes").insert(payload);

      if (error) {
        toast.error("Erro ao criar promoção");
        return;
      }
      toast.success("Promoção criada");
    }

    setShowDialog(false);
    loadData();
  };

  const toggleAtiva = async (promo: Promocao) => {
    const { error } = await supabase
      .from("promocoes")
      .update({ ativa: !promo.ativa })
      .eq("id", promo.id);

    if (error) {
      toast.error("Erro ao atualizar status");
      return;
    }
    loadData();
  };

  const isPromoValid = (promo: Promocao) => {
    if (!promo.ativa) return false;
    const now = new Date();
    const inicio = new Date(promo.inicia_em);
    const fim = promo.termina_em ? new Date(promo.termina_em) : null;
    return now >= inicio && (!fim || now <= fim);
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
            <h1 className="text-3xl font-bold">Promoções</h1>
          </div>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-5 w-5" />
            Nova Promoção
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-center">Desconto</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promocoes.map((promo) => (
                <TableRow key={promo.id}>
                  <TableCell className="font-medium">{promo.nome}</TableCell>
                  <TableCell>{promo.tipo === "global" ? "Global" : "Produto"}</TableCell>
                  <TableCell>{promo.produto?.nome || "-"}</TableCell>
                  <TableCell className="text-center">{promo.desconto_percentual}%</TableCell>
                  <TableCell>
                    {format(new Date(promo.inicia_em), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    {promo.termina_em
                      ? format(new Date(promo.termina_em), "dd/MM/yyyy HH:mm")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        isPromoValid(promo)
                          ? "bg-green-500/20 text-green-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isPromoValid(promo) ? "Ativa" : "Inativa"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Switch
                        checked={promo.ativa}
                        onCheckedChange={() => toggleAtiva(promo)}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(promo)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
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
              {editingPromo ? "Editar Promoção" : "Nova Promoção"}
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
              <Label>Desconto (%) *</Label>
              <Input
                type="number"
                step="0.01"
                max="100"
                value={form.desconto_percentual}
                onChange={(e) =>
                  setForm({ ...form, desconto_percentual: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => setForm({ ...form, tipo: v, produto_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="produto">Por Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.tipo === "produto" && (
              <div>
                <Label>Produto *</Label>
                <Select
                  value={form.produto_id}
                  onValueChange={(v) => setForm({ ...form, produto_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {produtos.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Início *</Label>
                <Input
                  type="datetime-local"
                  value={form.inicia_em}
                  onChange={(e) => setForm({ ...form, inicia_em: e.target.value })}
                />
              </div>
              <div>
                <Label>Fim (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={form.termina_em}
                  onChange={(e) => setForm({ ...form, termina_em: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.ativa}
                onCheckedChange={(checked) => setForm({ ...form, ativa: checked })}
              />
              <Label>Promoção ativa</Label>
            </div>
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
    </div>
  );
};

export default AdminPromocoes;

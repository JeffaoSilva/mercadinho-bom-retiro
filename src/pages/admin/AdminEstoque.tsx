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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Minus, Eye, Search } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { format } from "date-fns";

interface Produto {
  id: number;
  nome: string;
  quantidade_atual: number;
  preco_compra: number;
}

interface Lote {
  id: number;
  quantidade: number;
  validade: string | null;
  preco_compra_lote: number | null;
  criado_em: string;
  ativo: boolean;
}

const AdminEstoque = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const [showEntrada, setShowEntrada] = useState(false);
  const [showSaida, setShowSaida] = useState(false);
  const [showLotes, setShowLotes] = useState(false);
  const [selectedProduto, setSelectedProduto] = useState<Produto | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  
  const [entradaForm, setEntradaForm] = useState({
    quantidade: "",
    validade: "",
    preco_compra_lote: "",
  });
  const [saidaQtd, setSaidaQtd] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadProdutos();
  }, [isAuthenticated, authLoading, navigate]);

  const loadProdutos = async () => {
    // Buscar produtos ativos com preco_compra
    const { data: produtosData, error: produtosError } = await supabase
      .from("produtos")
      .select("id, nome, quantidade_atual, preco_compra")
      .eq("ativo", true)
      .order("nome");

    if (produtosError) {
      toast.error("Erro ao carregar produtos");
      setLoading(false);
      return;
    }

    // Buscar lotes ativos com preco_compra_lote
    const { data: lotesData } = await supabase
      .from("lotes_produtos")
      .select("produto_id, preco_compra_lote")
      .eq("ativo", true);

    // Criar Set de produtos com lote de custo diferente
    const produtoIdsComCustoDiferente = new Set<number>();
    for (const lote of lotesData || []) {
      if (lote.preco_compra_lote == null) continue;
      const produto = (produtosData || []).find((p) => p.id === lote.produto_id);
      if (produto && lote.preco_compra_lote !== produto.preco_compra) {
        produtoIdsComCustoDiferente.add(lote.produto_id);
      }
    }

    // Filtrar apenas produtos com lotes de custo diferente
    const produtosFiltrados = (produtosData || []).filter((p) =>
      produtoIdsComCustoDiferente.has(p.id)
    );

    setProdutos(produtosFiltrados);
    setLoading(false);
  };

  const loadLotes = async (produtoId: number) => {
    const { data, error } = await supabase
      .from("lotes_produtos")
      .select("*")
      .eq("produto_id", produtoId)
      .order("criado_em", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar lotes");
      return;
    }
    setLotes(data || []);
  };

  const filteredProdutos = produtos.filter((p) =>
    p.nome.toLowerCase().includes(search.toLowerCase())
  );

  const openEntrada = (produto: Produto) => {
    setSelectedProduto(produto);
    setEntradaForm({ quantidade: "", validade: "", preco_compra_lote: "" });
    setShowEntrada(true);
  };

  const openSaida = (produto: Produto) => {
    setSelectedProduto(produto);
    setSaidaQtd("");
    setShowSaida(true);
  };

  const openLotes = async (produto: Produto) => {
    setSelectedProduto(produto);
    await loadLotes(produto.id);
    setShowLotes(true);
  };

  const handleEntrada = async () => {
    if (!selectedProduto || !entradaForm.quantidade) {
      toast.error("Informe a quantidade");
      return;
    }

    const qtd = parseInt(entradaForm.quantidade);
    if (qtd <= 0) {
      toast.error("Quantidade inválida");
      return;
    }

    // Criar lote
    const { error: loteError } = await supabase.from("lotes_produtos").insert({
      produto_id: selectedProduto.id,
      quantidade: qtd,
      validade: entradaForm.validade || null,
      preco_compra_lote: entradaForm.preco_compra_lote
        ? parseFloat(entradaForm.preco_compra_lote)
        : null,
    });

    if (loteError) {
      toast.error("Erro ao criar lote");
      return;
    }

    // Atualizar quantidade do produto
    const { error: prodError } = await supabase
      .from("produtos")
      .update({ quantidade_atual: selectedProduto.quantidade_atual + qtd })
      .eq("id", selectedProduto.id);

    if (prodError) {
      toast.error("Erro ao atualizar estoque");
      return;
    }

    toast.success("Entrada registrada");
    setShowEntrada(false);
    loadProdutos();
  };

  const handleSaida = async () => {
    if (!selectedProduto || !saidaQtd) {
      toast.error("Informe a quantidade");
      return;
    }

    const qtd = parseInt(saidaQtd);
    if (qtd <= 0) {
      toast.error("Quantidade inválida");
      return;
    }

    if (qtd > selectedProduto.quantidade_atual) {
      toast.error("Quantidade maior que o estoque disponível");
      return;
    }

    const { error } = await supabase
      .from("produtos")
      .update({ quantidade_atual: selectedProduto.quantidade_atual - qtd })
      .eq("id", selectedProduto.id);

    if (error) {
      toast.error("Erro ao registrar saída");
      return;
    }

    toast.success("Saída registrada");
    setShowSaida(false);
    loadProdutos();
  };

  const toggleLoteAtivo = async (lote: Lote) => {
    const { error } = await supabase
      .from("lotes_produtos")
      .update({ ativo: !lote.ativo })
      .eq("id", lote.id);

    if (error) {
      toast.error("Erro ao atualizar lote");
      return;
    }
    loadLotes(selectedProduto!.id);
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
          <h1 className="text-3xl font-bold">Lotes</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12"
          />
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-center">Quantidade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProdutos.map((produto) => (
                <TableRow key={produto.id}>
                  <TableCell className="font-medium">{produto.nome}</TableCell>
                  <TableCell className="text-center text-lg font-semibold">
                    {produto.quantidade_atual}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" onClick={() => openEntrada(produto)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Entrada
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSaida(produto)}
                      >
                        <Minus className="h-4 w-4 mr-1" />
                        Saída
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openLotes(produto)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Lotes
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog Entrada */}
      <Dialog open={showEntrada} onOpenChange={setShowEntrada}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Entrada de Estoque - {selectedProduto?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label>Quantidade *</Label>
              <Input
                type="number"
                value={entradaForm.quantidade}
                onChange={(e) =>
                  setEntradaForm({ ...entradaForm, quantidade: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Validade (opcional)</Label>
              <Input
                type="date"
                value={entradaForm.validade}
                onChange={(e) =>
                  setEntradaForm({ ...entradaForm, validade: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Preço de Compra do Lote (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                value={entradaForm.preco_compra_lote}
                onChange={(e) =>
                  setEntradaForm({ ...entradaForm, preco_compra_lote: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowEntrada(false)}
              >
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleEntrada}>
                Confirmar Entrada
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Saída */}
      <Dialog open={showSaida} onOpenChange={setShowSaida}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saída de Estoque - {selectedProduto?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-muted-foreground">
              Estoque atual: {selectedProduto?.quantidade_atual}
            </p>
            <div>
              <Label>Quantidade *</Label>
              <Input
                type="number"
                value={saidaQtd}
                onChange={(e) => setSaidaQtd(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowSaida(false)}
              >
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleSaida}>
                Confirmar Saída
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Lotes */}
      <Dialog open={showLotes} onOpenChange={setShowLotes}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lotes - {selectedProduto?.nome}</DialogTitle>
          </DialogHeader>
          <div className="pt-4">
            {lotes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum lote registrado
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-center">Ativo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lotes.map((lote) => (
                    <TableRow key={lote.id} className={!lote.ativo ? "opacity-50" : ""}>
                      <TableCell>
                        {format(new Date(lote.criado_em), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell className="text-center">{lote.quantidade}</TableCell>
                      <TableCell>
                        {lote.validade
                          ? format(new Date(lote.validade), "dd/MM/yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {lote.preco_compra_lote
                          ? `R$ ${lote.preco_compra_lote.toFixed(2)}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant={lote.ativo ? "outline" : "secondary"}
                          onClick={() => toggleLoteAtivo(lote)}
                        >
                          {lote.ativo ? "Desativar" : "Ativar"}
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
    </div>
  );
};

export default AdminEstoque;

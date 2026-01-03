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
import { ArrowLeft, Plus, Pencil, Search, Camera, Loader2, CheckCircle, PackagePlus } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import CameraScanner from "@/components/CameraScanner";
import { playBeep } from "@/utils/beep";

interface Produto {
  id: number;
  nome: string;
  codigo_barras: string | null;
  preco_compra: number | null;
  preco_venda: number;
  ativo: boolean;
  quantidade_atual: number;
  quantidade_total: number;
  alerta_estoque_baixo_ativo: boolean;
  alerta_estoque_baixo_min: number;
}

const AdminProdutos = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDisponiveis, setShowDisponiveis] = useState(true);
  const [showEsgotados, setShowEsgotados] = useState(false);
  
  // Dialog de novo/editar produto
  const [showDialog, setShowDialog] = useState(false);
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    codigo_barras: "",
    preco_compra: "",
    preco_venda: "",
    ativo: true,
    alerta_estoque_baixo_ativo: false,
    alerta_estoque_baixo_min: "2",
  });

  // Campos de entrada inicial (para novo produto)
  const [showEntradaInicial, setShowEntradaInicial] = useState(false);
  const [precosEntradaEditados, setPrecosEntradaEditados] = useState(false);
  const [entradaForm, setEntradaForm] = useState({
    quantidadeTotal: "",
    precoCompraEntrada: "",
    precoVendaEntrada: "",
    validade: "",
    rateioCentral: "",
    rateioBomRetiro: "",
    rateioSaoFrancisco: "",
  });

  // Dialog de entrada para produto existente
  const [showEntradaDialog, setShowEntradaDialog] = useState(false);
  const [produtoEntrada, setProdutoEntrada] = useState<Produto | null>(null);
  const [entradaProdutoForm, setEntradaProdutoForm] = useState({
    quantidadeTotal: "",
    precoCompraEntrada: "",
    precoVendaEntrada: "",
    validade: "",
    rateioCentral: "",
    rateioBomRetiro: "",
    rateioSaoFrancisco: "",
  });
  const [salvandoEntrada, setSalvandoEntrada] = useState(false);
  const [sucessoEntrada, setSucessoEntrada] = useState(false);

  // Campo de entrada por código de barras
  const [codigoEntrada, setCodigoEntrada] = useState("");
  const [buscandoEntrada, setBuscandoEntrada] = useState(false);
  const [showCameraScannerEntrada, setShowCameraScannerEntrada] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadProdutos();
  }, [isAuthenticated, authLoading, navigate]);

  const loadProdutos = async () => {
    // Buscar produtos (incluindo inativos para admin)
    const { data: produtosData, error: produtosError } = await supabase
      .from("produtos")
      .select("*")
      .order("nome");

    if (produtosError) {
      toast.error("Erro ao carregar produtos");
      return;
    }

    // Buscar soma de quantidade_prateleira por produto_id (apenas ativos)
    const { data: prateleirasData } = await supabase
      .from("prateleiras_produtos")
      .select("produto_id, quantidade_prateleira")
      .eq("ativo", true);

    // Montar mapa de soma por produto_id
    const somaPrateleiras = new Map<number, number>();
    for (const p of prateleirasData || []) {
      const atual = somaPrateleiras.get(p.produto_id) || 0;
      somaPrateleiras.set(p.produto_id, atual + p.quantidade_prateleira);
    }

    // quantidade_total = central + prateleiras (não considera lotes)
    const produtosComTotal = (produtosData || []).map((prod) => ({
      ...prod,
      quantidade_total: prod.quantidade_atual + (somaPrateleiras.get(prod.id) || 0),
    }));

    setProdutos(produtosComTotal);
    setLoading(false);
  };

  // Filtrar por busca (nome ou código) e por disponibilidade
  const filteredProdutos = produtos.filter((p) => {
    const matchSearch = 
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.codigo_barras && p.codigo_barras.toLowerCase().includes(search.toLowerCase()));
    
    // Se nenhum filtro ativo, não mostrar nada
    if (!showDisponiveis && !showEsgotados) return false;
    // Se ambos ativos, mostrar todos
    if (showDisponiveis && showEsgotados) return matchSearch;
    // Se só disponíveis
    if (showDisponiveis) return matchSearch && p.quantidade_total > 0;
    // Se só esgotados
    return matchSearch && p.quantidade_total === 0;
  });

  const openNew = () => {
    setEditingProduto(null);
    setForm({ nome: "", codigo_barras: "", preco_compra: "", preco_venda: "", ativo: true, alerta_estoque_baixo_ativo: false, alerta_estoque_baixo_min: "2" });
    setShowEntradaInicial(true);
    setPrecosEntradaEditados(false);
    setEntradaForm({
      quantidadeTotal: "",
      precoCompraEntrada: "",
      precoVendaEntrada: "",
      validade: "",
      rateioCentral: "",
      rateioBomRetiro: "",
      rateioSaoFrancisco: "",
    });
    setShowDialog(true);
  };

  const openEdit = (produto: Produto) => {
    setEditingProduto(produto);
    setForm({
      nome: produto.nome,
      codigo_barras: produto.codigo_barras || "",
      preco_compra: (produto.preco_compra ?? 0).toString(),
      preco_venda: produto.preco_venda.toString(),
      ativo: produto.ativo,
      alerta_estoque_baixo_ativo: produto.alerta_estoque_baixo_ativo,
      alerta_estoque_baixo_min: produto.alerta_estoque_baixo_min.toString(),
    });
    setShowEntradaInicial(false);
    setShowDialog(true);
  };

  const validarRateio = (qtdTotal: number, central: number, bomRetiro: number, saoFrancisco: number): boolean => {
    const soma = central + bomRetiro + saoFrancisco;
    if (soma !== qtdTotal) {
      toast.error(`Soma dos rateios (${soma}) deve ser igual à quantidade total (${qtdTotal})`);
      return false;
    }
    return true;
  };

  const executarEntrada = async (produtoId: number, entrada: typeof entradaForm) => {
    const qtdTotal = parseInt(entrada.quantidadeTotal) || 0;
    const central = parseInt(entrada.rateioCentral) || 0;
    const bomRetiro = parseInt(entrada.rateioBomRetiro) || 0;
    const saoFrancisco = parseInt(entrada.rateioSaoFrancisco) || 0;
    const precoCompraNum = parseFloat(entrada.precoCompraEntrada);
    const precoVendaNum = parseFloat(entrada.precoVendaEntrada);

    // A) Inserir histórico em entradas_estoque
    const { error: entradaError } = await supabase.from("entradas_estoque").insert({
      produto_id: produtoId,
      quantidade_total: qtdTotal,
      preco_compra_entrada: precoCompraNum,
      preco_venda_sugerido: precoVendaNum,
      rateio_central: central,
      rateio_bom_retiro: bomRetiro,
      rateio_sao_francisco: saoFrancisco,
    });

    if (entradaError) throw entradaError;

    // B) Atualizar produto com novos preços e quantidade central
    const { data: produtoAtual } = await supabase
      .from("produtos")
      .select("quantidade_atual")
      .eq("id", produtoId)
      .single();

    const novaQtdCentral = (produtoAtual?.quantidade_atual || 0) + central;

    const { error: produtoError } = await supabase
      .from("produtos")
      .update({
        preco_compra: precoCompraNum,
        preco_venda: precoVendaNum,
        quantidade_atual: novaQtdCentral,
      })
      .eq("id", produtoId);

    if (produtoError) throw produtoError;

    // C) Upsert nas prateleiras por mercadinho
    const rateios = [
      { mercadinho_id: 1, quantidade: bomRetiro }, // Bom Retiro
      { mercadinho_id: 2, quantidade: saoFrancisco }, // São Francisco
    ];

    for (const rateio of rateios) {
      if (rateio.quantidade <= 0) continue;

      const { data: atual } = await supabase
        .from("prateleiras_produtos")
        .select("quantidade_prateleira")
        .eq("mercadinho_id", rateio.mercadinho_id)
        .eq("produto_id", produtoId)
        .eq("preco_venda_prateleira", precoVendaNum)
        .maybeSingle();

      const qtdNova = (atual?.quantidade_prateleira || 0) + rateio.quantidade;

      const { error } = await supabase
        .from("prateleiras_produtos")
        .upsert(
          {
            mercadinho_id: rateio.mercadinho_id,
            produto_id: produtoId,
            preco_venda_prateleira: precoVendaNum,
            quantidade_prateleira: qtdNova,
            ativo: true,
            atualizado_em: new Date().toISOString(),
          },
          {
            onConflict: "mercadinho_id,produto_id,preco_venda_prateleira",
            ignoreDuplicates: false,
          }
        );

      if (error) throw error;
    }

    // D) Se informou validade, criar lote
    if (entrada.validade) {
      const { error: loteError } = await supabase.from("lotes_produtos").insert({
        produto_id: produtoId,
        quantidade: qtdTotal,
        validade: entrada.validade,
        preco_compra_lote: precoCompraNum,
        ativo: true,
      });
      if (loteError) console.error("Erro ao criar lote:", loteError);
    }
  };

  const handleSave = async () => {
    if (!form.nome || !form.preco_venda) {
      toast.error("Preencha os campos obrigatórios (nome e preço de venda)");
      return;
    }

    const precoCompraValue = form.preco_compra.trim() ? parseFloat(form.preco_compra) : null;

    const payload = {
      nome: form.nome.trim(),
      codigo_barras: form.codigo_barras.trim() || null,
      preco_compra: precoCompraValue,
      preco_venda: parseFloat(form.preco_venda),
      ativo: form.ativo,
      alerta_estoque_baixo_ativo: form.alerta_estoque_baixo_ativo,
      alerta_estoque_baixo_min: Math.max(1, parseInt(form.alerta_estoque_baixo_min) || 2),
    };

    if (editingProduto) {
      // Atualizar produto existente
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
      // Criar novo produto com entrada inicial
      if (showEntradaInicial && entradaForm.quantidadeTotal) {
        const qtdTotal = parseInt(entradaForm.quantidadeTotal) || 0;
        const central = parseInt(entradaForm.rateioCentral) || 0;
        const bomRetiro = parseInt(entradaForm.rateioBomRetiro) || 0;
        const saoFrancisco = parseInt(entradaForm.rateioSaoFrancisco) || 0;

        // Usar preços do formulário principal se entrada não foi editada
        const precoCompraEntrada = entradaForm.precoCompraEntrada || form.preco_compra;
        const precoVendaEntrada = entradaForm.precoVendaEntrada || form.preco_venda;

        // Validar quantidade
        if (qtdTotal <= 0) {
          toast.error("Quantidade total deve ser maior que 0");
          return;
        }

        // Validar preços
        const precoCompraNum = parseFloat(precoCompraEntrada);
        const precoVendaNum = parseFloat(precoVendaEntrada);
        if (isNaN(precoCompraNum) || isNaN(precoVendaNum)) {
          toast.error("Preços de compra e venda da entrada são inválidos");
          return;
        }

        if (!validarRateio(qtdTotal, central, bomRetiro, saoFrancisco)) return;

        // Atualizar entradaForm com preços sincronizados antes de criar
        const entradaFormFinal = {
          ...entradaForm,
          precoCompraEntrada,
          precoVendaEntrada,
        };

        // Inserir produto
        const { data: novoProduto, error } = await supabase
          .from("produtos")
          .insert(payload)
          .select()
          .single();

        if (error || !novoProduto) {
          toast.error("Erro ao criar produto");
          return;
        }

        try {
          await executarEntrada(novoProduto.id, entradaFormFinal);
          toast.success("Produto criado com entrada registrada");
        } catch (err: any) {
          console.error("Erro ao registrar entrada:", err);
          const mensagem = err?.message || "Erro desconhecido ao registrar entrada";
          toast.error(`Erro na entrada: ${mensagem}`);
        }
      } else {
        // Sem entrada inicial
        const { data: novoProduto, error } = await supabase
          .from("produtos")
          .insert(payload)
          .select()
          .single();

        if (error || !novoProduto) {
          toast.error("Erro ao criar produto");
          return;
        }
        toast.success("Produto criado");
      }
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

  // Handler para código detectado pela câmera (no modal de novo produto)
  const handleCameraDetected = (code: string) => {
    setShowCameraScanner(false);
    setForm({ ...form, codigo_barras: code });
    playBeep();
    toast.success("Código lido: " + code);
  };

  // Handler para entrada por código de barras
  const buscarProdutoPorCodigo = async (codigo: string) => {
    if (!codigo.trim()) return;
    
    setBuscandoEntrada(true);
    
    const { data: produto, error } = await supabase
      .from("produtos")
      .select("*")
      .eq("codigo_barras", codigo.trim())
      .maybeSingle();

    setBuscandoEntrada(false);

    if (error) {
      toast.error("Erro ao buscar produto");
      return;
    }

    if (produto) {
      // Produto existe - abrir modal de entrada
      const produtoComTotal: Produto = {
        ...produto,
        quantidade_total: produto.quantidade_atual, // Will be updated after load
      };
      setProdutoEntrada(produtoComTotal);
      setEntradaProdutoForm({
        quantidadeTotal: "",
        precoCompraEntrada: (produto.preco_compra ?? 0).toString(),
        precoVendaEntrada: produto.preco_venda.toString(),
        validade: "",
        rateioCentral: "",
        rateioBomRetiro: "",
        rateioSaoFrancisco: "",
      });
      setShowEntradaDialog(true);
      playBeep();
    } else {
      // Produto não existe - abrir novo produto com código preenchido
      setEditingProduto(null);
      setForm({
        nome: "",
        codigo_barras: codigo.trim(),
        preco_compra: "",
        preco_venda: "",
        ativo: true,
        alerta_estoque_baixo_ativo: false,
        alerta_estoque_baixo_min: "2",
      });
      setShowEntradaInicial(true);
      setEntradaForm({
        quantidadeTotal: "",
        precoCompraEntrada: "",
        precoVendaEntrada: "",
        validade: "",
        rateioCentral: "",
        rateioBomRetiro: "",
        rateioSaoFrancisco: "",
      });
      setShowDialog(true);
      toast.info("Produto não encontrado. Cadastre um novo.");
    }
    
    setCodigoEntrada("");
  };

  const handleCameraScannerEntrada = (code: string) => {
    setShowCameraScannerEntrada(false);
    buscarProdutoPorCodigo(code);
  };

  const handleSalvarEntradaProduto = async () => {
    if (!produtoEntrada) return;

    if (!entradaProdutoForm.quantidadeTotal || !entradaProdutoForm.precoCompraEntrada || !entradaProdutoForm.precoVendaEntrada) {
      toast.error("Preencha quantidade e preços");
      return;
    }

    const qtdTotal = parseInt(entradaProdutoForm.quantidadeTotal) || 0;
    const central = parseInt(entradaProdutoForm.rateioCentral) || 0;
    const bomRetiro = parseInt(entradaProdutoForm.rateioBomRetiro) || 0;
    const saoFrancisco = parseInt(entradaProdutoForm.rateioSaoFrancisco) || 0;

    if (!validarRateio(qtdTotal, central, bomRetiro, saoFrancisco)) return;

    setSalvandoEntrada(true);

    try {
      await executarEntrada(produtoEntrada.id, entradaProdutoForm);
      setSucessoEntrada(true);
      toast.success("Entrada registrada com sucesso!");

      setTimeout(() => {
        setSucessoEntrada(false);
        setShowEntradaDialog(false);
        setProdutoEntrada(null);
        loadProdutos();
      }, 1500);
    } catch (err) {
      console.error("Erro ao salvar entrada:", err);
      toast.error("Erro ao registrar entrada");
    } finally {
      setSalvandoEntrada(false);
    }
  };

  const somaRateioEntrada = () => {
    return (
      (parseInt(entradaProdutoForm.rateioCentral) || 0) +
      (parseInt(entradaProdutoForm.rateioBomRetiro) || 0) +
      (parseInt(entradaProdutoForm.rateioSaoFrancisco) || 0)
    );
  };

  const somaRateioNovoProduto = () => {
    return (
      (parseInt(entradaForm.rateioCentral) || 0) +
      (parseInt(entradaForm.rateioBomRetiro) || 0) +
      (parseInt(entradaForm.rateioSaoFrancisco) || 0)
    );
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
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
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

        {/* Entrada por código de barras */}
        <div className="bg-card p-4 rounded-lg border">
          <Label className="text-sm font-medium mb-2 block">Entrada por Código de Barras</Label>
          <div className="flex gap-2">
            <Input
              value={codigoEntrada}
              onChange={(e) => setCodigoEntrada(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscarProdutoPorCodigo(codigoEntrada)}
              placeholder="Escaneie ou digite o código..."
              className="flex-1"
            />
            <Button onClick={() => buscarProdutoPorCodigo(codigoEntrada)} disabled={buscandoEntrada}>
              {buscandoEntrada ? <Loader2 className="w-5 h-5 animate-spin" /> : <PackagePlus className="w-5 h-5" />}
            </Button>
            <Button variant="outline" onClick={() => setShowCameraScannerEntrada(true)}>
              <Camera className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            onClick={() => setShowDisponiveis(!showDisponiveis)}
            className={`h-16 text-lg font-semibold transition-all ${
              showDisponiveis
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            variant="ghost"
          >
            Disponíveis
          </Button>
          <Button
            onClick={() => setShowEsgotados(!showEsgotados)}
            className={`h-16 text-lg font-semibold transition-all ${
              showEsgotados
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            variant="ghost"
          >
            Esgotados
          </Button>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código de barras..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12"
          />
        </div>

        {/* Tabela ou mensagem de filtro */}
        {!showDisponiveis && !showEsgotados ? (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            Selecione um filtro acima.
          </div>
        ) : (
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
                {filteredProdutos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum produto encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProdutos.map((produto) => (
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialog Novo/Editar Produto */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setForm({ ...form, preco_compra: val });
                    // Sincronizar com entrada se não editado manualmente
                    if (!precosEntradaEditados && !editingProduto) {
                      setEntradaForm((prev) => ({ ...prev, precoCompraEntrada: val }));
                    }
                  }}
                />
              </div>
              <div>
                <Label>Preço Venda *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.preco_venda}
                  onChange={(e) => {
                    const val = e.target.value;
                    setForm({ ...form, preco_venda: val });
                    // Sincronizar com entrada se não editado manualmente
                    if (!precosEntradaEditados && !editingProduto) {
                      setEntradaForm((prev) => ({ ...prev, precoVendaEntrada: val }));
                    }
                  }}
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

            {/* Configuração de alerta de estoque baixo */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.alerta_estoque_baixo_ativo}
                  onCheckedChange={(checked) => setForm({ ...form, alerta_estoque_baixo_ativo: checked })}
                />
                <Label>Alerta de estoque baixo</Label>
              </div>
              {form.alerta_estoque_baixo_ativo && (
                <div>
                  <Label>Quantidade mínima para alertar</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.alerta_estoque_baixo_min}
                    onChange={(e) => setForm({ ...form, alerta_estoque_baixo_min: e.target.value })}
                    className="w-32"
                  />
                </div>
              )}
            </div>

            {/* Entrada Inicial (apenas para novo produto) */}
            {!editingProduto && showEntradaInicial && (
              <div className="border-t pt-4 space-y-4">
                <h3 className="font-semibold text-lg">Entrada Inicial</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Quantidade Total</Label>
                    <Input
                      type="number"
                      value={entradaForm.quantidadeTotal}
                      onChange={(e) => setEntradaForm({ ...entradaForm, quantidadeTotal: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Preço Compra Entrada</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={entradaForm.precoCompraEntrada}
                      onChange={(e) => {
                        setPrecosEntradaEditados(true);
                        setEntradaForm({ ...entradaForm, precoCompraEntrada: e.target.value });
                      }}
                      placeholder={form.preco_compra || "0.00"}
                    />
                  </div>
                  <div>
                    <Label>Preço Venda Entrada</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={entradaForm.precoVendaEntrada}
                      onChange={(e) => {
                        setPrecosEntradaEditados(true);
                        setEntradaForm({ ...entradaForm, precoVendaEntrada: e.target.value });
                      }}
                      placeholder={form.preco_venda || "0.00"}
                    />
                  </div>
                </div>
                <div>
                  <Label>Validade (opcional)</Label>
                  <Input
                    type="date"
                    value={entradaForm.validade}
                    onChange={(e) => setEntradaForm({ ...entradaForm, validade: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rateio por Mercadinho</Label>
                  <p className="text-sm text-muted-foreground">
                    Soma deve ser igual à quantidade total ({entradaForm.quantidadeTotal || 0})
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs">Central</Label>
                      <Input
                        type="number"
                        value={entradaForm.rateioCentral}
                        onChange={(e) => setEntradaForm({ ...entradaForm, rateioCentral: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Bom Retiro</Label>
                      <Input
                        type="number"
                        value={entradaForm.rateioBomRetiro}
                        onChange={(e) => setEntradaForm({ ...entradaForm, rateioBomRetiro: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">São Francisco</Label>
                      <Input
                        type="number"
                        value={entradaForm.rateioSaoFrancisco}
                        onChange={(e) => setEntradaForm({ ...entradaForm, rateioSaoFrancisco: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="mt-2 p-2 bg-muted rounded-lg text-center text-sm">
                    Soma atual: <strong>{somaRateioNovoProduto()}</strong> / {entradaForm.quantidadeTotal || 0}
                  </div>
                </div>
              </div>
            )}

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

      {/* Dialog Entrada para Produto Existente */}
      <Dialog open={showEntradaDialog} onOpenChange={setShowEntradaDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Entrada / Reposição</DialogTitle>
          </DialogHeader>
          
          {sucessoEntrada ? (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-green-600">Entrada Registrada!</h2>
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              {produtoEntrada && (
                <div className="bg-primary/10 p-4 rounded-lg">
                  <h2 className="text-xl font-bold">{produtoEntrada.nome}</h2>
                  <p className="text-sm text-muted-foreground">
                    Código: {produtoEntrada.codigo_barras}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Quantidade Total *</Label>
                  <Input
                    type="number"
                    value={entradaProdutoForm.quantidadeTotal}
                    onChange={(e) => setEntradaProdutoForm({ ...entradaProdutoForm, quantidadeTotal: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Preço Compra *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={entradaProdutoForm.precoCompraEntrada}
                    onChange={(e) => setEntradaProdutoForm({ ...entradaProdutoForm, precoCompraEntrada: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>Preço Venda *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={entradaProdutoForm.precoVendaEntrada}
                    onChange={(e) => setEntradaProdutoForm({ ...entradaProdutoForm, precoVendaEntrada: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <Label>Validade (opcional)</Label>
                <Input
                  type="date"
                  value={entradaProdutoForm.validade}
                  onChange={(e) => setEntradaProdutoForm({ ...entradaProdutoForm, validade: e.target.value })}
                />
              </div>

              <div className="border-t pt-4 space-y-2">
                <Label>Rateio por Mercadinho</Label>
                <p className="text-sm text-muted-foreground">
                  Soma deve ser igual à quantidade total ({entradaProdutoForm.quantidadeTotal || 0})
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Central</Label>
                    <Input
                      type="number"
                      value={entradaProdutoForm.rateioCentral}
                      onChange={(e) => setEntradaProdutoForm({ ...entradaProdutoForm, rateioCentral: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Bom Retiro</Label>
                    <Input
                      type="number"
                      value={entradaProdutoForm.rateioBomRetiro}
                      onChange={(e) => setEntradaProdutoForm({ ...entradaProdutoForm, rateioBomRetiro: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">São Francisco</Label>
                    <Input
                      type="number"
                      value={entradaProdutoForm.rateioSaoFrancisco}
                      onChange={(e) => setEntradaProdutoForm({ ...entradaProdutoForm, rateioSaoFrancisco: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="mt-2 p-2 bg-muted rounded-lg text-center text-sm">
                  Soma atual: <strong>{somaRateioEntrada()}</strong> / {entradaProdutoForm.quantidadeTotal || 0}
                </div>
              </div>

              <Button
                className="w-full h-12"
                onClick={handleSalvarEntradaProduto}
                disabled={salvandoEntrada}
              >
                {salvandoEntrada && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Registrar Entrada
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Camera Scanner Modal (para novo produto) */}
      {showCameraScanner && (
        <CameraScanner
          onDetected={handleCameraDetected}
          onClose={() => setShowCameraScanner(false)}
          title="Escaneie o código de barras"
        />
      )}

      {/* Camera Scanner Modal (para entrada) */}
      {showCameraScannerEntrada && (
        <CameraScanner
          onDetected={handleCameraScannerEntrada}
          onClose={() => setShowCameraScannerEntrada(false)}
          title="Escaneie o código de barras"
        />
      )}
    </div>
  );
};

export default AdminProdutos;

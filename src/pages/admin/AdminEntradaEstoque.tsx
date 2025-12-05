import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Search, Package, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface Produto {
  id: number;
  nome: string;
  codigo_barras: string | null;
  preco_compra: number;
  preco_venda: number;
}

interface Mercadinho {
  id: number;
  nome: string;
}

const AdminEntradaEstoque = () => {
  const navigate = useNavigate();
  const [codigoBarras, setCodigoBarras] = useState("");
  const [produto, setProduto] = useState<Produto | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const [mercadinhos, setMercadinhos] = useState<Mercadinho[]>([]);

  // Campos do formulário
  const [quantidadeTotal, setQuantidadeTotal] = useState("");
  const [precoCompra, setPrecoCompra] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [rateioCentral, setRateioCentral] = useState("");
  const [rateioBomRetiro, setRateioBomRetiro] = useState("");
  const [rateioSaoFrancisco, setRateioSaoFrancisco] = useState("");

  useEffect(() => {
    loadMercadinhos();
  }, []);

  const loadMercadinhos = async () => {
    const { data } = await supabase
      .from("mercadinhos")
      .select("id, nome")
      .order("id");
    setMercadinhos(data || []);
  };

  const buscarProduto = async () => {
    if (!codigoBarras.trim()) return;

    setBuscando(true);
    setProduto(null);

    const { data, error } = await supabase
      .from("produtos")
      .select("id, nome, codigo_barras, preco_compra, preco_venda")
      .eq("codigo_barras", codigoBarras.trim())
      .maybeSingle();

    setBuscando(false);

    if (error) {
      toast.error("Erro ao buscar produto");
      return;
    }

    if (data) {
      setProduto(data);
      setPrecoCompra(data.preco_compra.toString());
      setPrecoVenda(data.preco_venda.toString());
    } else {
      toast.error("Produto não encontrado");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      buscarProduto();
    }
  };

  const validarRateio = (): boolean => {
    const qtdTotal = parseInt(quantidadeTotal) || 0;
    const central = parseInt(rateioCentral) || 0;
    const bomRetiro = parseInt(rateioBomRetiro) || 0;
    const saoFrancisco = parseInt(rateioSaoFrancisco) || 0;

    const soma = central + bomRetiro + saoFrancisco;

    if (soma !== qtdTotal) {
      toast.error(`Soma dos rateios (${soma}) deve ser igual à quantidade total (${qtdTotal})`);
      return false;
    }

    return true;
  };

  const handleSalvar = async () => {
    if (!produto) return;

    if (!quantidadeTotal || !precoCompra || !precoVenda) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (!validarRateio()) return;

    setSalvando(true);

    try {
      const qtdTotal = parseInt(quantidadeTotal);
      const central = parseInt(rateioCentral) || 0;
      const bomRetiro = parseInt(rateioBomRetiro) || 0;
      const saoFrancisco = parseInt(rateioSaoFrancisco) || 0;
      const precoCompraNum = parseFloat(precoCompra);
      const precoVendaNum = parseFloat(precoVenda);

      // A) Inserir histórico em entradas_estoque
      const { error: entradaError } = await supabase.from("entradas_estoque").insert({
        produto_id: produto.id,
        quantidade_total: qtdTotal,
        preco_compra_entrada: precoCompraNum,
        preco_venda_sugerido: precoVendaNum,
        rateio_central: central,
        rateio_bom_retiro: bomRetiro,
        rateio_sao_francisco: saoFrancisco,
      });

      if (entradaError) throw entradaError;

      // B) Atualizar produto com novos preços
      const { data: produtoAtual } = await supabase
        .from("produtos")
        .select("quantidade_atual")
        .eq("id", produto.id)
        .single();

      const novaQtdCentral = (produtoAtual?.quantidade_atual || 0) + central;

      const { error: produtoError } = await supabase
        .from("produtos")
        .update({
          preco_compra: precoCompraNum,
          preco_venda: precoVendaNum,
          quantidade_atual: novaQtdCentral,
        })
        .eq("id", produto.id);

      if (produtoError) throw produtoError;

      // D) Upsert nas prateleiras por mercadinho (central não vai para prateleiras)
      const rateios = [
        { mercadinho_id: 1, quantidade: bomRetiro }, // Bom Retiro
        { mercadinho_id: 2, quantidade: saoFrancisco }, // São Francisco
      ];

      for (const rateio of rateios) {
        if (rateio.quantidade > 0) {
          // Verificar se já existe prateleira com esse preço
          const { data: prateleiraExistente } = await supabase
            .from("prateleiras_produtos")
            .select("id, quantidade_prateleira")
            .eq("mercadinho_id", rateio.mercadinho_id)
            .eq("produto_id", produto.id)
            .eq("preco_venda_prateleira", precoVendaNum)
            .eq("ativo", true)
            .maybeSingle();

          if (prateleiraExistente) {
            // Atualizar quantidade existente
            await supabase
              .from("prateleiras_produtos")
              .update({
                quantidade_prateleira:
                  prateleiraExistente.quantidade_prateleira + rateio.quantidade,
              })
              .eq("id", prateleiraExistente.id);
          } else {
            // Criar nova linha de prateleira
            await supabase.from("prateleiras_produtos").insert({
              mercadinho_id: rateio.mercadinho_id,
              produto_id: produto.id,
              preco_venda_prateleira: precoVendaNum,
              quantidade_prateleira: rateio.quantidade,
              ativo: true,
            });
          }
        }
      }

      setSucesso(true);
      toast.success("Entrada registrada com sucesso!");

      // Reset form após 2 segundos
      setTimeout(() => {
        setSucesso(false);
        setProduto(null);
        setCodigoBarras("");
        setQuantidadeTotal("");
        setPrecoCompra("");
        setPrecoVenda("");
        setRateioCentral("");
        setRateioBomRetiro("");
        setRateioSaoFrancisco("");
      }, 2000);
    } catch (error) {
      console.error("Erro ao salvar entrada:", error);
      toast.error("Erro ao registrar entrada");
    } finally {
      setSalvando(false);
    }
  };

  if (sucesso) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="text-center space-y-6">
          <CheckCircle className="w-24 h-24 text-green-500 mx-auto" />
          <h1 className="text-4xl font-bold text-green-600">Entrada Registrada!</h1>
          <p className="text-muted-foreground">Preparando para nova entrada...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-3xl font-bold">Entrada / Reposição</h1>
        </div>

        {/* Busca por código de barras */}
        <div className="bg-card p-6 rounded-lg border space-y-4">
          <Label>Código de Barras</Label>
          <div className="flex gap-2">
            <Input
              value={codigoBarras}
              onChange={(e) => setCodigoBarras(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escaneie ou digite o código..."
              className="text-lg"
              autoFocus
            />
            <Button onClick={buscarProduto} disabled={buscando}>
              {buscando ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </Button>
          </div>

          {!produto && codigoBarras && !buscando && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/admin/produtos")}
            >
              <Package className="w-5 h-5 mr-2" />
              Cadastrar Novo Produto
            </Button>
          )}
        </div>

        {/* Formulário de entrada */}
        {produto && (
          <div className="bg-card p-6 rounded-lg border space-y-6">
            <div className="bg-primary/10 p-4 rounded-lg">
              <h2 className="text-xl font-bold">{produto.nome}</h2>
              <p className="text-sm text-muted-foreground">
                Código: {produto.codigo_barras}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantidade Total *</Label>
                <Input
                  type="number"
                  value={quantidadeTotal}
                  onChange={(e) => setQuantidadeTotal(e.target.value)}
                  placeholder="0"
                  className="text-lg"
                />
              </div>
              <div className="space-y-2">
                <Label>Preço Compra *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={precoCompra}
                  onChange={(e) => setPrecoCompra(e.target.value)}
                  placeholder="0.00"
                  className="text-lg"
                />
              </div>
              <div className="space-y-2">
                <Label>Preço Venda *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={precoVenda}
                  onChange={(e) => setPrecoVenda(e.target.value)}
                  placeholder="0.00"
                  className="text-lg"
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Rateio por Mercadinho</h3>
              <p className="text-sm text-muted-foreground mb-4">
                A soma dos rateios deve ser igual à quantidade total ({quantidadeTotal || 0})
              </p>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Central</Label>
                  <Input
                    type="number"
                    value={rateioCentral}
                    onChange={(e) => setRateioCentral(e.target.value)}
                    placeholder="0"
                    className="text-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bom Retiro</Label>
                  <Input
                    type="number"
                    value={rateioBomRetiro}
                    onChange={(e) => setRateioBomRetiro(e.target.value)}
                    placeholder="0"
                    className="text-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label>São Francisco</Label>
                  <Input
                    type="number"
                    value={rateioSaoFrancisco}
                    onChange={(e) => setRateioSaoFrancisco(e.target.value)}
                    placeholder="0"
                    className="text-lg"
                  />
                </div>
              </div>

              <div className="mt-4 p-3 bg-muted rounded-lg text-center">
                <span className="text-sm text-muted-foreground">Soma atual: </span>
                <span className="font-bold">
                  {(parseInt(rateioCentral) || 0) +
                    (parseInt(rateioBomRetiro) || 0) +
                    (parseInt(rateioSaoFrancisco) || 0)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {" "}
                  / {quantidadeTotal || 0}
                </span>
              </div>
            </div>

            <Button
              className="w-full h-14 text-xl"
              onClick={handleSalvar}
              disabled={salvando}
            >
              {salvando ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : null}
              Registrar Entrada
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminEntradaEstoque;

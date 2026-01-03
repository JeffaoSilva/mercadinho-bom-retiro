import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Store, Warehouse, Package, Search, Camera, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import CameraScanner from "@/components/CameraScanner";
import { playBeep } from "@/utils/beep";

interface PrateleiraItem {
  id: number;
  mercadinho_id: number;
  produto_id: number;
  preco_venda_prateleira: number;
  quantidade_prateleira: number;
  ativo: boolean;
  produtos: {
    nome: string;
    codigo_barras: string | null;
    preco_compra: number | null;
    preco_venda: number;
    ativo: boolean;
  } | null;
}

interface ProdutoGeral {
  id: number;
  nome: string;
  codigo_barras: string | null;
  preco_compra: number | null;
  preco_venda: number;
  quantidade_atual: number;
  ativo: boolean;
}

const AdminPrateleirasEstoque = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  // Filtro por código de barras
  const [filtroBarras, setFiltroBarras] = useState("");
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  
  // Toggles combináveis - todos iniciam desligados para forçar seleção manual
  const [showBR, setShowBR] = useState(false);
  const [showSF, setShowSF] = useState(false);
  const [showGeral, setShowGeral] = useState(false);

  // Dados
  const [prateleiraBR, setPrateleiraBR] = useState<PrateleiraItem[]>([]);
  const [prateleiraSF, setPrateleiraSF] = useState<PrateleiraItem[]>([]);
  const [produtosGeral, setProdutosGeral] = useState<ProdutoGeral[]>([]);
  const [validadeMap, setValidadeMap] = useState<Map<number, string | null>>(new Map());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Buscar prateleiras BR (mercadinho_id = 1) com quantidade > 0
      const { data: br } = await supabase
        .from("prateleiras_produtos")
        .select(`
          id, mercadinho_id, produto_id, preco_venda_prateleira, quantidade_prateleira, ativo,
          produtos (nome, codigo_barras, preco_compra, preco_venda, ativo)
        `)
        .eq("mercadinho_id", 1)
        .eq("ativo", true)
        .gt("quantidade_prateleira", 0)
        .order("produto_id")
        .order("preco_venda_prateleira");

      // Buscar prateleiras SF (mercadinho_id = 2) com quantidade > 0
      const { data: sf } = await supabase
        .from("prateleiras_produtos")
        .select(`
          id, mercadinho_id, produto_id, preco_venda_prateleira, quantidade_prateleira, ativo,
          produtos (nome, codigo_barras, preco_compra, preco_venda, ativo)
        `)
        .eq("mercadinho_id", 2)
        .eq("ativo", true)
        .gt("quantidade_prateleira", 0)
        .order("produto_id")
        .order("preco_venda_prateleira");

      // Buscar estoque geral com quantidade > 0
      const { data: geral } = await supabase
        .from("produtos")
        .select("id, nome, codigo_barras, preco_compra, preco_venda, quantidade_atual, ativo")
        .eq("ativo", true)
        .gt("quantidade_atual", 0)
        .order("nome");

      // Buscar validades dos lotes
      const { data: lotes } = await supabase
        .from("lotes_produtos")
        .select("produto_id, validade, quantidade")
        .eq("ativo", true)
        .order("validade", { ascending: true });

      // Montar mapa de validade mais próxima por produto
      const validadeMapTemp = new Map<number, string | null>();
      for (const l of lotes ?? []) {
        if (!validadeMapTemp.has(l.produto_id) && l.validade) {
          validadeMapTemp.set(l.produto_id, l.validade);
        }
      }

      setPrateleiraBR((br as PrateleiraItem[]) || []);
      setPrateleiraSF((sf as PrateleiraItem[]) || []);
      setProdutosGeral((geral as ProdutoGeral[]) || []);
      setValidadeMap(validadeMapTemp);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatValidade = (validade: string | null | undefined) => {
    if (!validade) return "—";
    try {
      return format(new Date(validade), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "—";
    }
  };

  // Filtrar itens por código de barras
  const filtrarPorBarras = (item: PrateleiraItem) => {
    if (!filtroBarras.trim()) return true;
    return item.produtos?.codigo_barras?.includes(filtroBarras.trim()) || false;
  };

  const filtrarProdutoPorBarras = (produto: ProdutoGeral) => {
    if (!filtroBarras.trim()) return true;
    return produto.codigo_barras?.includes(filtroBarras.trim()) || false;
  };

  // Dados filtrados
  const prateleiraBRFiltrada = prateleiraBR.filter(filtrarPorBarras);
  const prateleiraSFFiltrada = prateleiraSF.filter(filtrarPorBarras);
  const produtosGeralFiltrados = produtosGeral.filter(filtrarProdutoPorBarras);

  // Handler para código detectado pela câmera
  const handleCameraDetected = (code: string) => {
    setShowCameraScanner(false);
    setFiltroBarras(code);
    playBeep();
  };

  const nenhumToggleAtivo = !showBR && !showSF && !showGeral;

  const renderPrateleiraItem = (item: PrateleiraItem) => {
    const produto = item.produtos;
    if (!produto) return null;

    const isInativo = !produto.ativo || !item.ativo;
    const validade = validadeMap.get(item.produto_id);

    return (
      <Card key={item.id} className={`${isInativo ? "opacity-60" : ""}`}>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-lg">{produto.nome}</h3>
                {isInativo && (
                  <Badge variant="destructive">INATIVO</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground font-mono">
                {produto.codigo_barras || "Sem código"}
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div className="text-center p-2 bg-muted rounded-lg">
                <p className="text-muted-foreground text-xs">Qtd Prateleira</p>
                <p className="font-bold text-lg">{item.quantidade_prateleira}</p>
              </div>
              <div className="text-center p-2 bg-primary/10 rounded-lg">
                <p className="text-muted-foreground text-xs">Venda Prateleira</p>
                <p className="font-bold text-primary">R$ {item.preco_venda_prateleira.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-muted rounded-lg">
                <p className="text-muted-foreground text-xs">Venda Padrão</p>
                <p className="font-semibold">R$ {produto.preco_venda.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-muted rounded-lg">
                <p className="text-muted-foreground text-xs">Compra</p>
                <p className="font-semibold">R$ {(produto.preco_compra ?? 0).toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-muted rounded-lg">
                <p className="text-muted-foreground text-xs">Validade Próx.</p>
                <p className="font-semibold">{formatValidade(validade)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderProdutoGeral = (produto: ProdutoGeral) => {
    const validade = validadeMap.get(produto.id);
    const isInativo = !produto.ativo;

    return (
      <Card key={produto.id} className={`${isInativo ? "opacity-60" : ""}`}>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-lg">{produto.nome}</h3>
                {isInativo && (
                  <Badge variant="destructive">INATIVO</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground font-mono">
                {produto.codigo_barras || "Sem código"}
              </p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center p-2 bg-muted rounded-lg">
                <p className="text-muted-foreground text-xs">Qtd Central</p>
                <p className="font-bold text-lg">{produto.quantidade_atual}</p>
              </div>
              <div className="text-center p-2 bg-primary/10 rounded-lg">
                <p className="text-muted-foreground text-xs">Venda Padrão</p>
                <p className="font-bold text-primary">R$ {produto.preco_venda.toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-muted rounded-lg">
                <p className="text-muted-foreground text-xs">Compra</p>
                <p className="font-semibold">R$ {(produto.preco_compra ?? 0).toFixed(2)}</p>
              </div>
              <div className="text-center p-2 bg-muted rounded-lg">
                <p className="text-muted-foreground text-xs">Validade Próx.</p>
                <p className="font-semibold">{formatValidade(validade)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-3xl font-bold">Prateleiras / Estoque</h1>
        </div>

        {/* Filtro por código de barras */}
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                value={filtroBarras}
                onChange={(e) => setFiltroBarras(e.target.value)}
                placeholder="Filtrar por código de barras..."
                className="pl-10 h-12"
              />
              {filtroBarras && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => setFiltroBarras("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12"
              onClick={() => setShowCameraScanner(true)}
              title="Ler pela câmera"
            >
              <Camera className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Camera Scanner Modal */}
        {showCameraScanner && (
          <CameraScanner
            onDetected={handleCameraDetected}
            onClose={() => setShowCameraScanner(false)}
            title="Escaneie o código de barras"
          />
        )}

        {/* Toggle Buttons */}
        <div className="grid grid-cols-3 gap-4">
          <Button
            onClick={() => setShowBR(!showBR)}
            className={`h-24 text-xl font-bold transition-all ${
              showBR
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            variant="ghost"
          >
            <Store className="mr-3 h-8 w-8" />
            Bom Retiro
          </Button>
          
          <Button
            onClick={() => setShowSF(!showSF)}
            className={`h-24 text-xl font-bold transition-all ${
              showSF
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            variant="ghost"
          >
            <Store className="mr-3 h-8 w-8" />
            São Francisco
          </Button>
          
          <Button
            onClick={() => setShowGeral(!showGeral)}
            className={`h-24 text-xl font-bold transition-all ${
              showGeral
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            variant="ghost"
          >
            <Warehouse className="mr-3 h-8 w-8" />
            Estoque Central
          </Button>
        </div>

        {nenhumToggleAtivo && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-xl">Selecione um estoque acima.</p>
          </div>
        )}

        {/* Seção Bom Retiro */}
        {showBR && (
          <Card>
            <CardHeader className="bg-primary/5">
              <CardTitle className="text-2xl flex items-center gap-3">
                <Store className="h-6 w-6" />
                Bom Retiro (Prateleira)
                <Badge variant="secondary">{prateleiraBRFiltrada.length} itens</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {prateleiraBRFiltrada.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum produto na prateleira.
                </p>
              ) : (
                prateleiraBRFiltrada.map(renderPrateleiraItem)
              )}
            </CardContent>
          </Card>
        )}

        {/* Seção São Francisco */}
        {showSF && (
          <Card>
            <CardHeader className="bg-primary/5">
              <CardTitle className="text-2xl flex items-center gap-3">
                <Store className="h-6 w-6" />
                São Francisco (Prateleira)
                <Badge variant="secondary">{prateleiraSFFiltrada.length} itens</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {prateleiraSFFiltrada.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum produto na prateleira.
                </p>
              ) : (
                prateleiraSFFiltrada.map(renderPrateleiraItem)
              )}
            </CardContent>
          </Card>
        )}

        {/* Seção Estoque Central */}
        {showGeral && (
          <Card>
            <CardHeader className="bg-primary/5">
              <CardTitle className="text-2xl flex items-center gap-3">
                <Warehouse className="h-6 w-6" />
                Estoque Central (Geral)
                <Badge variant="secondary">{produtosGeralFiltrados.length} itens</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {produtosGeralFiltrados.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {filtroBarras ? "Nenhum produto encontrado com esse código." : "Nenhum produto cadastrado."}
                </p>
              ) : (
                produtosGeralFiltrados.map(renderProdutoGeral)
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminPrateleirasEstoque;

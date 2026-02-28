import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Store, Warehouse, Package, Search, Camera, X, ArrowUpDown, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import CameraScanner from "@/components/CameraScanner";
import { playBeep } from "@/utils/beep";
import { toast } from "sonner";

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

type SortOption = "nome-asc" | "qtd-asc" | "qtd-desc";

type OrigemType = "central" | "br" | "sf";

interface TransferInfo {
  produto_id: number;
  produto_nome: string;
  origem: OrigemType;
  disponivel: number;
  preco_venda: number;
  prateleira_id?: number; // only for loja origins
}

const ORIGENS_LABEL: Record<OrigemType, string> = {
  central: "Estoque Central",
  br: "Bom Retiro",
  sf: "São Francisco",
};

const MERCADINHO_IDS: Record<string, number> = { br: 1, sf: 2 };

const AdminPrateleirasEstoque = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  const [filtroBarras, setFiltroBarras] = useState("");
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  
  const [showBR, setShowBR] = useState(false);
  const [showSF, setShowSF] = useState(false);
  const [showGeral, setShowGeral] = useState(false);

  const [sortOption, setSortOption] = useState<SortOption>("nome-asc");

  const [prateleiraBR, setPrateleiraBR] = useState<PrateleiraItem[]>([]);
  const [prateleiraSF, setPrateleiraSF] = useState<PrateleiraItem[]>([]);
  const [produtosGeral, setProdutosGeral] = useState<ProdutoGeral[]>([]);
  const [validadeMap, setValidadeMap] = useState<Map<number, string | null>>(new Map());

  // Transfer modal state
  const [transferInfo, setTransferInfo] = useState<TransferInfo | null>(null);
  const [transferDestino, setTransferDestino] = useState<string>("");
  const [transferQtd, setTransferQtd] = useState<string>("");
  const [transferindo, setTransferindo] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
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

      const { data: geral } = await supabase
        .from("produtos")
        .select("id, nome, codigo_barras, preco_compra, preco_venda, quantidade_atual, ativo")
        .eq("ativo", true)
        .gt("quantidade_atual", 0)
        .order("nome");

      const { data: lotes } = await supabase
        .from("lotes_produtos")
        .select("produto_id, validade, quantidade")
        .eq("ativo", true)
        .order("validade", { ascending: true });

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

  const formatMoney = (value: number | null) => {
    return `R$ ${(value ?? 0).toFixed(2).replace(".", ",")}`;
  };

  const filtrarPorBarrasOuNome = (item: PrateleiraItem) => {
    if (!filtroBarras.trim()) return true;
    const termo = filtroBarras.trim().toLowerCase();
    const matchNome = item.produtos?.nome?.toLowerCase().includes(termo) || false;
    const matchBarras = item.produtos?.codigo_barras?.includes(filtroBarras.trim()) || false;
    return matchNome || matchBarras;
  };

  const filtrarProdutoPorBarrasOuNome = (produto: ProdutoGeral) => {
    if (!filtroBarras.trim()) return true;
    const termo = filtroBarras.trim().toLowerCase();
    const matchNome = produto.nome?.toLowerCase().includes(termo) || false;
    const matchBarras = produto.codigo_barras?.includes(filtroBarras.trim()) || false;
    return matchNome || matchBarras;
  };

  const sortPrateleiraItems = (items: PrateleiraItem[]): PrateleiraItem[] => {
    return [...items].sort((a, b) => {
      const nomeA = a.produtos?.nome?.toLowerCase() || "";
      const nomeB = b.produtos?.nome?.toLowerCase() || "";
      switch (sortOption) {
        case "nome-asc": return nomeA.localeCompare(nomeB, "pt-BR");
        case "qtd-asc": return a.quantidade_prateleira - b.quantidade_prateleira;
        case "qtd-desc": return b.quantidade_prateleira - a.quantidade_prateleira;
        default: return nomeA.localeCompare(nomeB, "pt-BR");
      }
    });
  };

  const sortProdutosGeral = (items: ProdutoGeral[]): ProdutoGeral[] => {
    return [...items].sort((a, b) => {
      const nomeA = a.nome?.toLowerCase() || "";
      const nomeB = b.nome?.toLowerCase() || "";
      switch (sortOption) {
        case "nome-asc": return nomeA.localeCompare(nomeB, "pt-BR");
        case "qtd-asc": return a.quantidade_atual - b.quantidade_atual;
        case "qtd-desc": return b.quantidade_atual - a.quantidade_atual;
        default: return nomeA.localeCompare(nomeB, "pt-BR");
      }
    });
  };

  const prateleiraBRFiltrada = useMemo(() => 
    sortPrateleiraItems(prateleiraBR.filter(filtrarPorBarrasOuNome)),
    [prateleiraBR, filtroBarras, sortOption]
  );
  
  const prateleiraSFFiltrada = useMemo(() => 
    sortPrateleiraItems(prateleiraSF.filter(filtrarPorBarrasOuNome)),
    [prateleiraSF, filtroBarras, sortOption]
  );
  
  const produtosGeralFiltrados = useMemo(() => 
    sortProdutosGeral(produtosGeral.filter(filtrarProdutoPorBarrasOuNome)),
    [produtosGeral, filtroBarras, sortOption]
  );

  const handleCameraDetected = (code: string) => {
    setShowCameraScanner(false);
    setFiltroBarras(code);
    playBeep();
  };

  // ---- Transfer logic ----

  const openTransferModal = (info: TransferInfo) => {
    setTransferInfo(info);
    setTransferDestino("");
    setTransferQtd("");
    setTransferindo(false);
  };

  const closeTransferModal = () => {
    if (transferindo) return;
    setTransferInfo(null);
  };

  const transferQtdNum = parseInt(transferQtd) || 0;
  const transferValido = transferInfo
    ? transferDestino !== "" && transferQtdNum > 0 && transferQtdNum <= transferInfo.disponivel
    : false;
  const excedeuQtd = transferInfo ? transferQtdNum > transferInfo.disponivel : false;

  const destinosDisponiveis = useMemo(() => {
    if (!transferInfo) return [];
    const all: { value: OrigemType; label: string }[] = [
      { value: "central", label: "Estoque Central" },
      { value: "br", label: "Bom Retiro" },
      { value: "sf", label: "São Francisco" },
    ];
    return all.filter((d) => d.value !== transferInfo.origem);
  }, [transferInfo]);

  const handleTransfer = async () => {
    if (!transferInfo || !transferValido || transferindo) return;
    setTransferindo(true);

    try {
      const qtd = transferQtdNum;
      const destino = transferDestino as OrigemType;
      const { origem, produto_id, preco_venda } = transferInfo;

      // 1) Diminuir da origem
      if (origem === "central") {
        const { error: errOrigem } = await supabase
          .from("produtos")
          .update({ quantidade_atual: transferInfo.disponivel - qtd })
          .eq("id", produto_id);
        if (errOrigem) throw errOrigem;
      } else {
        const { error: errOrigem } = await supabase
          .from("prateleiras_produtos")
          .update({ quantidade_prateleira: transferInfo.disponivel - qtd, atualizado_em: new Date().toISOString() })
          .eq("id", transferInfo.prateleira_id!);
        if (errOrigem) throw errOrigem;
      }

      // 2) Aumentar no destino
      if (destino === "central") {
        // Fetch current
        const { data: prod, error: errFetch } = await supabase
          .from("produtos")
          .select("quantidade_atual")
          .eq("id", produto_id)
          .single();
        if (errFetch || !prod) throw errFetch || new Error("Produto não encontrado");
        const { error: errDest } = await supabase
          .from("produtos")
          .update({ quantidade_atual: prod.quantidade_atual + qtd })
          .eq("id", produto_id);
        if (errDest) throw errDest;
      } else {
        const mercIdDest = MERCADINHO_IDS[destino];
        // Check if prateleira exists
        const { data: existing } = await supabase
          .from("prateleiras_produtos")
          .select("id, quantidade_prateleira, ativo")
          .eq("mercadinho_id", mercIdDest)
          .eq("produto_id", produto_id)
          .maybeSingle();

        if (existing) {
          const updates: any = {
            quantidade_prateleira: existing.quantidade_prateleira + qtd,
            atualizado_em: new Date().toISOString(),
          };
          if (!existing.ativo) updates.ativo = true;
          const { error: errUp } = await supabase
            .from("prateleiras_produtos")
            .update(updates)
            .eq("id", existing.id);
          if (errUp) throw errUp;
        } else {
          const { error: errInsert } = await supabase
            .from("prateleiras_produtos")
            .insert({
              mercadinho_id: mercIdDest,
              produto_id,
              quantidade_prateleira: qtd,
              preco_venda_prateleira: preco_venda,
              ativo: true,
            });
          if (errInsert) throw errInsert;
        }
      }

      toast.success(`Transferido ${qtd}x para ${ORIGENS_LABEL[destino]}`);
      setTransferInfo(null);
      loadData();
    } catch (err: any) {
      console.error("Erro na transferência:", err);
      toast.error("Erro ao transferir estoque. Tente novamente.");
    } finally {
      setTransferindo(false);
    }
  };

  const nenhumToggleAtivo = !showBR && !showSF && !showGeral;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const renderTransferBtn = (info: TransferInfo) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2"
      onClick={() => openTransferModal(info)}
      title="Transferir"
    >
      <ArrowRightLeft className="h-4 w-4" />
    </Button>
  );

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

        {/* Filtro */}
        <div className="bg-card p-4 rounded-lg border">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                value={filtroBarras}
                onChange={(e) => setFiltroBarras(e.target.value)}
                placeholder="Buscar por nome ou código de barras..."
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
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="w-full sm:w-[200px] h-12">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Ordenar por..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nome-asc">Nome (A → Z)</SelectItem>
                <SelectItem value="qtd-asc">Quantidade (menor)</SelectItem>
                <SelectItem value="qtd-desc">Quantidade (maior)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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
            <CardContent className="p-0">
              {prateleiraBRFiltrada.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum produto na prateleira.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Produto</TableHead>
                        <TableHead className="text-center w-[100px]">Qtd</TableHead>
                        <TableHead className="text-right w-[120px]">Compra</TableHead>
                        <TableHead className="text-right w-[120px]">Venda</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prateleiraBRFiltrada.map((item) => {
                        const produto = item.produtos;
                        if (!produto) return null;
                        const isInativo = !produto.ativo || !item.ativo;
                        return (
                          <TableRow key={item.id} className={isInativo ? "opacity-60" : ""}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{produto.nome}</span>
                                {isInativo && <Badge variant="destructive" className="text-xs">INATIVO</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-bold text-lg">
                              {item.quantidade_prateleira}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatMoney(produto.preco_compra)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {formatMoney(item.preco_venda_prateleira)}
                            </TableCell>
                            <TableCell>
                              {renderTransferBtn({
                                produto_id: item.produto_id,
                                produto_nome: produto.nome,
                                origem: "br",
                                disponivel: item.quantidade_prateleira,
                                preco_venda: item.preco_venda_prateleira,
                                prateleira_id: item.id,
                              })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
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
            <CardContent className="p-0">
              {prateleiraSFFiltrada.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum produto na prateleira.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Produto</TableHead>
                        <TableHead className="text-center w-[100px]">Qtd</TableHead>
                        <TableHead className="text-right w-[120px]">Compra</TableHead>
                        <TableHead className="text-right w-[120px]">Venda</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prateleiraSFFiltrada.map((item) => {
                        const produto = item.produtos;
                        if (!produto) return null;
                        const isInativo = !produto.ativo || !item.ativo;
                        return (
                          <TableRow key={item.id} className={isInativo ? "opacity-60" : ""}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{produto.nome}</span>
                                {isInativo && <Badge variant="destructive" className="text-xs">INATIVO</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-bold text-lg">
                              {item.quantidade_prateleira}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatMoney(produto.preco_compra)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {formatMoney(item.preco_venda_prateleira)}
                            </TableCell>
                            <TableCell>
                              {renderTransferBtn({
                                produto_id: item.produto_id,
                                produto_nome: produto.nome,
                                origem: "sf",
                                disponivel: item.quantidade_prateleira,
                                preco_venda: item.preco_venda_prateleira,
                                prateleira_id: item.id,
                              })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
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
            <CardContent className="p-0">
              {produtosGeralFiltrados.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {filtroBarras ? "Nenhum produto encontrado com esse código." : "Nenhum produto cadastrado."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Produto</TableHead>
                        <TableHead className="text-center w-[100px]">Qtd</TableHead>
                        <TableHead className="text-right w-[120px]">Compra</TableHead>
                        <TableHead className="text-right w-[120px]">Venda</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {produtosGeralFiltrados.map((produto) => {
                        const isInativo = !produto.ativo;
                        return (
                          <TableRow key={produto.id} className={isInativo ? "opacity-60" : ""}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{produto.nome}</span>
                                {isInativo && <Badge variant="destructive" className="text-xs">INATIVO</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-bold text-lg">
                              {produto.quantidade_atual}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatMoney(produto.preco_compra)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {formatMoney(produto.preco_venda)}
                            </TableCell>
                            <TableCell>
                              {renderTransferBtn({
                                produto_id: produto.id,
                                produto_nome: produto.nome,
                                origem: "central",
                                disponivel: produto.quantidade_atual,
                                preco_venda: produto.preco_venda,
                              })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de Transferência */}
      <Dialog open={!!transferInfo} onOpenChange={(open) => { if (!open) closeTransferModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Transferir Estoque
            </DialogTitle>
          </DialogHeader>
          {transferInfo && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Produto</p>
                <p className="font-semibold text-lg">{transferInfo.produto_nome}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Origem</p>
                  <p className="font-medium">{ORIGENS_LABEL[transferInfo.origem]}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Disponível</p>
                  <p className="font-bold text-lg">{transferInfo.disponivel}</p>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Destino</label>
                <Select value={transferDestino} onValueChange={setTransferDestino}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinosDisponiveis.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Quantidade</label>
                <Input
                  type="number"
                  min={1}
                  max={transferInfo.disponivel}
                  value={transferQtd}
                  onChange={(e) => setTransferQtd(e.target.value)}
                  placeholder="0"
                />
                {excedeuQtd && (
                  <p className="text-sm text-destructive mt-1">
                    Quantidade excede o disponível ({transferInfo.disponivel})
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeTransferModal} disabled={transferindo}>
              Cancelar
            </Button>
            <Button onClick={handleTransfer} disabled={!transferValido || transferindo}>
              {transferindo && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPrateleirasEstoque;

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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Store, Warehouse, Package, Search, Camera, X, ArrowUpDown, ArrowRightLeft, Trash2, Eye, AlertTriangle } from "lucide-react";
import BackButton from "@/components/BackButton";
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

interface RetiradaRow {
  id: number;
  produto_id: number;
  quantidade: number;
  origem: string;
  motivo: string;
  descricao: string;
  preco_compra_snapshot: number | null;
  preco_venda_snapshot: number;
  criado_em: string;
  produtos?: { nome: string } | null;
}

type SortOption = "nome-asc" | "qtd-asc" | "qtd-desc";

type OrigemType = "central" | "br" | "sf";

interface TransferInfo {
  produto_id: number;
  produto_nome: string;
  origem: OrigemType;
  disponivel: number;
  preco_venda: number;
  prateleira_id?: number;
}

interface RemoveInfo {
  produto_id: number;
  produto_nome: string;
  origem: OrigemType;
  disponivel: number;
  preco_compra: number | null;
  preco_venda: number;
  prateleira_id?: number;
}

const ORIGENS_LABEL: Record<OrigemType, string> = {
  central: "Estoque Central",
  br: "Bom Retiro",
  sf: "São Francisco",
};

const MERCADINHO_IDS: Record<string, number> = { br: 1, sf: 2 };

const MOTIVOS_RETIRADA = ["Vencido", "Danificado", "Perda", "Outros"];

const AdminPrateleirasEstoque = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  const [filtroBarras, setFiltroBarras] = useState("");
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  
  const [showBR, setShowBR] = useState(false);
  const [showSF, setShowSF] = useState(false);
  const [showGeral, setShowGeral] = useState(false);
  const [showRetirados, setShowRetirados] = useState(false);

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

  // Remove modal state
  const [removeInfo, setRemoveInfo] = useState<RemoveInfo | null>(null);
  const [removeQtd, setRemoveQtd] = useState<string>("");
  const [removeMotivo, setRemoveMotivo] = useState<string>("");
  const [removeDescricao, setRemoveDescricao] = useState<string>("");
  const [removendo, setRemovendo] = useState(false);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const [showConfirmCancelRemove, setShowConfirmCancelRemove] = useState(false);

  // Retiradas data
  const [retiradas, setRetiradas] = useState<RetiradaRow[]>([]);
  const [retiradaDetalhe, setRetiradaDetalhe] = useState<RetiradaRow | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [brRes, sfRes, geralRes, lotesRes, retiradasRes] = await Promise.all([
        supabase
          .from("prateleiras_produtos")
          .select(`id, mercadinho_id, produto_id, preco_venda_prateleira, quantidade_prateleira, ativo, produtos (nome, codigo_barras, preco_compra, preco_venda, ativo)`)
          .eq("mercadinho_id", 1).eq("ativo", true).gt("quantidade_prateleira", 0)
          .order("produto_id").order("preco_venda_prateleira"),
        supabase
          .from("prateleiras_produtos")
          .select(`id, mercadinho_id, produto_id, preco_venda_prateleira, quantidade_prateleira, ativo, produtos (nome, codigo_barras, preco_compra, preco_venda, ativo)`)
          .eq("mercadinho_id", 2).eq("ativo", true).gt("quantidade_prateleira", 0)
          .order("produto_id").order("preco_venda_prateleira"),
        supabase
          .from("produtos")
          .select("id, nome, codigo_barras, preco_compra, preco_venda, quantidade_atual, ativo")
          .eq("ativo", true).gt("quantidade_atual", 0).order("nome"),
        supabase
          .from("lotes_produtos")
          .select("produto_id, validade, quantidade")
          .eq("ativo", true).order("validade", { ascending: true }),
        supabase
          .from("retiradas")
          .select("id, produto_id, quantidade, origem, motivo, descricao, preco_compra_snapshot, preco_venda_snapshot, criado_em, produtos (nome)")
          .order("criado_em", { ascending: false }),
      ]);

      const validadeMapTemp = new Map<number, string | null>();
      for (const l of lotesRes.data ?? []) {
        if (!validadeMapTemp.has(l.produto_id) && l.validade) {
          validadeMapTemp.set(l.produto_id, l.validade);
        }
      }

      setPrateleiraBR((brRes.data as PrateleiraItem[]) || []);
      setPrateleiraSF((sfRes.data as PrateleiraItem[]) || []);
      setProdutosGeral((geralRes.data as ProdutoGeral[]) || []);
      setValidadeMap(validadeMapTemp);
      setRetiradas((retiradasRes.data as any[]) || []);
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

      if (destino === "central") {
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

  // ---- Remove logic ----
  const openRemoveModal = (info: RemoveInfo) => {
    setRemoveInfo(info);
    setRemoveQtd("");
    setRemoveMotivo("");
    setRemoveDescricao("");
    setRemovendo(false);
    setShowConfirmRemove(false);
    setShowConfirmCancelRemove(false);
  };

  const closeRemoveModal = () => {
    if (removendo) return;
    setRemoveInfo(null);
    setShowConfirmRemove(false);
    setShowConfirmCancelRemove(false);
  };

  const handleCancelRemoveClick = () => {
    if (removendo) return;
    setShowConfirmCancelRemove(true);
  };

  const handleConfirmRemoveClick = () => {
    if (!removeValido || removendo) return;
    setShowConfirmRemove(true);
  };

  const removeQtdNum = parseInt(removeQtd) || 0;
  const removeExcedeu = removeInfo ? removeQtdNum > removeInfo.disponivel : false;
  const removeValido = removeInfo
    ? removeQtdNum > 0 && removeQtdNum <= removeInfo.disponivel && removeMotivo !== "" && removeDescricao.trim() !== ""
    : false;

  const handleRemove = async () => {
    if (!removeInfo || !removeValido || removendo) return;
    setRemovendo(true);

    try {
      const qtd = removeQtdNum;
      const { origem, produto_id, preco_compra, preco_venda } = removeInfo;

      // 1) Diminuir estoque da origem
      if (origem === "central") {
        const { error } = await supabase
          .from("produtos")
          .update({ quantidade_atual: removeInfo.disponivel - qtd })
          .eq("id", produto_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("prateleiras_produtos")
          .update({ quantidade_prateleira: removeInfo.disponivel - qtd, atualizado_em: new Date().toISOString() })
          .eq("id", removeInfo.prateleira_id!);
        if (error) throw error;
      }

      // 2) Registrar retirada
      const { error: errInsert } = await supabase.from("retiradas").insert({
        produto_id,
        quantidade: qtd,
        origem,
        motivo: removeMotivo,
        descricao: removeDescricao.trim(),
        preco_compra_snapshot: preco_compra,
        preco_venda_snapshot: preco_venda,
      });
      if (errInsert) throw errInsert;

      toast.success(`${qtd}x retirado(s) do estoque`);
      setRemoveInfo(null);
      loadData();
    } catch (err: any) {
      console.error("Erro na retirada:", err);
      toast.error("Erro ao registrar retirada. Tente novamente.");
    } finally {
      setRemovendo(false);
    }
  };

  // ---- Helpers ----
  const nenhumToggleAtivo = !showBR && !showSF && !showGeral && !showRetirados;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const renderActionBtns = (transferData: TransferInfo, removeData: RemoveInfo) => (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => openTransferModal(transferData)}
        title="Transferir"
      >
        <ArrowRightLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-destructive hover:text-destructive"
        onClick={() => openRemoveModal(removeData)}
        title="Remover"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  const renderPrateleiraRow = (item: PrateleiraItem, origem: OrigemType) => {
    const produto = item.produtos;
    if (!produto) return null;
    const isInativo = !produto.ativo || !item.ativo;
    const commonTransfer: TransferInfo = {
      produto_id: item.produto_id,
      produto_nome: produto.nome,
      origem,
      disponivel: item.quantidade_prateleira,
      preco_venda: item.preco_venda_prateleira,
      prateleira_id: item.id,
    };
    const commonRemove: RemoveInfo = {
      ...commonTransfer,
      preco_compra: produto.preco_compra,
    };
    return (
      <TableRow key={item.id} className={isInativo ? "opacity-60" : ""}>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-medium">{produto.nome}</span>
            {isInativo && <Badge variant="destructive" className="text-xs">INATIVO</Badge>}
          </div>
        </TableCell>
        <TableCell className="text-center font-bold text-lg">{item.quantidade_prateleira}</TableCell>
        <TableCell className="text-right text-muted-foreground">{formatMoney(produto.preco_compra)}</TableCell>
        <TableCell className="text-right font-semibold text-primary">{formatMoney(item.preco_venda_prateleira)}</TableCell>
        <TableCell>{renderActionBtns(commonTransfer, commonRemove)}</TableCell>
      </TableRow>
    );
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <BackButton to="/admin" />
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
        <div className="grid grid-cols-4 gap-4">
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
          <Button
            onClick={() => setShowRetirados(!showRetirados)}
            className={`h-24 text-xl font-bold transition-all ${
              showRetirados
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            variant="ghost"
          >
            <AlertTriangle className="mr-3 h-8 w-8" />
            Retirados
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
                <p className="text-muted-foreground text-center py-8">Nenhum produto na prateleira.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Produto</TableHead>
                        <TableHead className="text-center w-[100px]">Qtd</TableHead>
                        <TableHead className="text-right w-[120px]">Compra</TableHead>
                        <TableHead className="text-right w-[120px]">Venda</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prateleiraBRFiltrada.map((item) => renderPrateleiraRow(item, "br"))}
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
                <p className="text-muted-foreground text-center py-8">Nenhum produto na prateleira.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Produto</TableHead>
                        <TableHead className="text-center w-[100px]">Qtd</TableHead>
                        <TableHead className="text-right w-[120px]">Compra</TableHead>
                        <TableHead className="text-right w-[120px]">Venda</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prateleiraSFFiltrada.map((item) => renderPrateleiraRow(item, "sf"))}
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
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {produtosGeralFiltrados.map((produto) => {
                        const isInativo = !produto.ativo;
                        const transferData: TransferInfo = {
                          produto_id: produto.id,
                          produto_nome: produto.nome,
                          origem: "central",
                          disponivel: produto.quantidade_atual,
                          preco_venda: produto.preco_venda,
                        };
                        const removeData: RemoveInfo = {
                          ...transferData,
                          preco_compra: produto.preco_compra,
                        };
                        return (
                          <TableRow key={produto.id} className={isInativo ? "opacity-60" : ""}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{produto.nome}</span>
                                {isInativo && <Badge variant="destructive" className="text-xs">INATIVO</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-bold text-lg">{produto.quantidade_atual}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatMoney(produto.preco_compra)}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{formatMoney(produto.preco_venda)}</TableCell>
                            <TableCell>{renderActionBtns(transferData, removeData)}</TableCell>
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

        {/* Seção Retirados */}
        {showRetirados && (
          <Card>
            <CardHeader className="bg-destructive/5">
              <CardTitle className="text-2xl flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                Produtos Retirados
                <Badge variant="destructive">{retiradas.length} registros</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {retiradas.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhuma retirada registrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">Produto</TableHead>
                        <TableHead className="text-center w-[60px]">Qtd</TableHead>
                        <TableHead className="w-[120px]">Origem</TableHead>
                        <TableHead className="w-[100px]">Motivo</TableHead>
                        <TableHead className="text-right w-[110px]">Compra (un)</TableHead>
                        <TableHead className="text-right w-[110px]">Venda (un)</TableHead>
                        <TableHead className="text-right w-[120px]">Custo Perdido</TableHead>
                        <TableHead className="text-right w-[120px]">Venda Perdida</TableHead>
                        <TableHead className="w-[80px]">Data</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {retiradas.map((r) => {
                        const custoPerdido = r.preco_compra_snapshot != null ? r.quantidade * r.preco_compra_snapshot : null;
                        const vendaPerdida = r.quantidade * r.preco_venda_snapshot;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{(r.produtos as any)?.nome ?? "—"}</TableCell>
                            <TableCell className="text-center font-bold">{r.quantidade}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {ORIGENS_LABEL[r.origem as OrigemType] ?? r.origem}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">{r.motivo}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {r.preco_compra_snapshot != null ? formatMoney(r.preco_compra_snapshot) : "Não informado"}
                            </TableCell>
                            <TableCell className="text-right">{formatMoney(r.preco_venda_snapshot)}</TableCell>
                            <TableCell className="text-right font-semibold text-destructive">
                              {custoPerdido != null ? formatMoney(custoPerdido) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-destructive">
                              {formatMoney(vendaPerdida)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(new Date(r.criado_em), "dd/MM/yy", { locale: ptBR })}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2"
                                onClick={() => setRetiradaDetalhe(r)}
                                title="Ver detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
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

      {/* Modal de Remoção */}
      <Dialog open={!!removeInfo} onOpenChange={(open) => { if (!open) closeRemoveModal(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Remover do Estoque
            </DialogTitle>
          </DialogHeader>
          {removeInfo && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Produto</p>
                <p className="font-semibold text-lg">{removeInfo.produto_nome}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Origem</p>
                  <p className="font-medium">{ORIGENS_LABEL[removeInfo.origem]}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Disponível</p>
                  <p className="font-bold text-lg">{removeInfo.disponivel}</p>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Quantidade a remover *</label>
                <Input
                  type="number"
                  min={1}
                  max={removeInfo.disponivel}
                  value={removeQtd}
                  onChange={(e) => setRemoveQtd(e.target.value)}
                  placeholder="0"
                />
                {removeExcedeu && (
                  <p className="text-sm text-destructive mt-1">
                    Quantidade excede o disponível ({removeInfo.disponivel})
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Motivo *</label>
                <Select value={removeMotivo} onValueChange={setRemoveMotivo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_RETIRADA.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Descrição *</label>
                <Textarea
                  value={removeDescricao}
                  onChange={(e) => setRemoveDescricao(e.target.value)}
                  placeholder="Descreva o motivo da retirada..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeRemoveModal} disabled={removendo}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={!removeValido || removendo}>
              {removendo && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar Retirada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhe da Retirada */}
      <Dialog open={!!retiradaDetalhe} onOpenChange={(open) => { if (!open) setRetiradaDetalhe(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Detalhe da Retirada
            </DialogTitle>
          </DialogHeader>
          {retiradaDetalhe && (() => {
            const custoPerdido = retiradaDetalhe.preco_compra_snapshot != null
              ? retiradaDetalhe.quantidade * retiradaDetalhe.preco_compra_snapshot
              : null;
            const vendaPerdida = retiradaDetalhe.quantidade * retiradaDetalhe.preco_venda_snapshot;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Produto</p>
                    <p className="font-semibold">{(retiradaDetalhe.produtos as any)?.nome ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Quantidade</p>
                    <p className="font-bold text-lg">{retiradaDetalhe.quantidade}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Origem</p>
                    <p className="font-medium">{ORIGENS_LABEL[retiradaDetalhe.origem as OrigemType] ?? retiradaDetalhe.origem}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Motivo</p>
                    <Badge variant="secondary">{retiradaDetalhe.motivo}</Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Preço de Compra</p>
                    <p className="font-medium">
                      {retiradaDetalhe.preco_compra_snapshot != null ? formatMoney(retiradaDetalhe.preco_compra_snapshot) : "Não informado"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Preço de Venda</p>
                    <p className="font-medium">{formatMoney(retiradaDetalhe.preco_venda_snapshot)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Custo Total Perdido</p>
                    <p className="font-bold text-destructive">{custoPerdido != null ? formatMoney(custoPerdido) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Venda Potencial Perdida</p>
                    <p className="font-bold text-destructive">{formatMoney(vendaPerdida)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Descrição</p>
                  <p className="mt-1 p-3 bg-muted rounded-md text-sm">{retiradaDetalhe.descricao}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Data/Hora</p>
                  <p className="font-medium">{format(new Date(retiradaDetalhe.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetiradaDetalhe(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPrateleirasEstoque;

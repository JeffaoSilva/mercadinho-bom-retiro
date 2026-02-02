import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout, CartItem } from "@/hooks/useCheckout";
import { ArrowLeft, Minus, Plus, Trash2, AlertTriangle, Camera, Keyboard } from "lucide-react";
import CameraScanner from "@/components/CameraScanner";
import { playBeep } from "@/utils/beep";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  buscarExposicoesProduto,
  totalDisponivelProduto,
  Exposicao,
} from "@/services/prateleiras";

interface Promocao {
  id: number;
  desconto_percentual: number;
  tipo: string;
  produto_id: number | null;
}

const Cart = () => {
  const navigate = useNavigate();
  const {
    clienteNome,
    mercadinhoAtualId,
    cart,
    addToCartWithPrice,
    updateQuantity,
    removeFromCart,
    reset,
  } = useCheckout();
  const [barcode, setBarcode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Cache de exposições por produto
  const [exposicoesCache, setExposicoesCache] = useState<Map<number, Exposicao[]>>(new Map());

  const handleBackClick = () => {
    if (cart.length > 0) {
      setShowCancelModal(true);
    } else {
      navigate("/");
    }
  };

  const handleCancelPurchase = () => {
    reset();
    setShowCancelModal(false);
    navigate("/");
  };

  // Foco sem abrir teclado ao montar/atualizar carrinho
  useEffect(() => {
    // Usar setTimeout para garantir que o foco aconteça após o render
    // readOnly inicial impede abertura do teclado
    const timer = setTimeout(() => {
      if (inputRef.current && !keyboardOpen) {
        inputRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [cart, keyboardOpen]);

  // Handler para abrir teclado manualmente
  const handleOpenKeyboard = useCallback(() => {
    setKeyboardOpen(true);
    // Pequeno delay para garantir que readOnly seja removido antes do focus
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.readOnly = false;
        inputRef.current.focus();
        // Trigger virtual keyboard by simulating click
        inputRef.current.click();
      }
    }, 50);
  }, []);

  useEffect(() => {
    loadPromocoes();
  }, []);

  const loadPromocoes = async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("promocoes")
      .select("id, desconto_percentual, tipo, produto_id")
      .eq("ativa", true)
      .lte("inicia_em", now)
      .or(`termina_em.is.null,termina_em.gte.${now}`);

    setPromocoes(data || []);
  };

  const getPromoForProduct = (produtoId: number): Promocao | null => {
    const produtoPromo = promocoes.find(
      (p) => p.tipo === "produto" && p.produto_id === produtoId
    );
    if (produtoPromo) return produtoPromo;

    const globalPromo = promocoes.find((p) => p.tipo === "global");
    return globalPromo || null;
  };

  const getPrecoComDesconto = (
    preco: number,
    produtoId: number
  ): { precoFinal: number; temDesconto: boolean; desconto: number } => {
    const promo = getPromoForProduct(produtoId);
    if (promo) {
      const precoFinal = preco * (1 - promo.desconto_percentual / 100);
      return { precoFinal, temDesconto: true, desconto: promo.desconto_percentual };
    }
    return { precoFinal: preco, temDesconto: false, desconto: 0 };
  };

  // Calcula quanto já foi "reservado" de cada prateleira no carrinho
  const getQuantidadeReservadaPorPrateleira = (produtoId: number): Map<number, number> => {
    const mapa = new Map<number, number>();
    cart
      .filter((item) => item.produto_id === produtoId && item.prateleira_id)
      .forEach((item) => {
        const atual = mapa.get(item.prateleira_id!) || 0;
        mapa.set(item.prateleira_id!, atual + item.quantidade);
      });
    return mapa;
  };

  // Encontra próxima prateleira disponível
  const encontrarProximaPrateleiraDisponivel = (
    exposicoes: Exposicao[],
    reservado: Map<number, number>
  ): Exposicao | null => {
    for (const expo of exposicoes) {
      const jaReservado = reservado.get(expo.id) || 0;
      if (expo.quantidade_prateleira - jaReservado > 0) {
        return expo;
      }
    }
    return null;
  };

  // Função que realmente adiciona o produto ao carrinho
  const addProductByBarcode = async (code: string) => {
    // Normalizar: remover tudo que não for dígito
    const normalizado = code.replace(/[^\d]/g, "").trim();
    
    if (!normalizado) {
      toast.error("Código de barras inválido");
      return;
    }

    setBarcode(normalizado);
    const mercadinhoId = mercadinhoAtualId || 1;

    try {
      // Buscar produto pelo código de barras normalizado
      const { data: produto, error } = await supabase
        .from("produtos")
        .select("*")
        .eq("codigo_barras", normalizado)
        .maybeSingle();

      if (error) throw error;

      if (!produto) {
        toast.error("Produto não encontrado");
        setBarcode("");
        return;
      }

      // Buscar exposições desse produto na prateleira
      const exposicoes = await buscarExposicoesProduto(mercadinhoId, produto.id);

      // Verificar total disponível
      const totalDisponivel = await totalDisponivelProduto(mercadinhoId, produto.id);

      if (totalDisponivel === 0 || exposicoes.length === 0) {
        toast.error("Produto não disponível na prateleira");
        setBarcode("");
        return;
      }

      // Atualizar cache
      setExposicoesCache((prev) => new Map(prev).set(produto.id, exposicoes));

      // Verificar quanto já está no carrinho desse produto
      const reservado = getQuantidadeReservadaPorPrateleira(produto.id);
      const totalNoCarrinho = cart
        .filter((i) => i.produto_id === produto.id)
        .reduce((sum, i) => sum + i.quantidade, 0);

      if (totalNoCarrinho >= totalDisponivel) {
        toast.error("Quantidade máxima disponível já no carrinho");
        setBarcode("");
        return;
      }

      // Encontrar próxima prateleira disponível
      const prateleiraDisponivel = encontrarProximaPrateleiraDisponivel(exposicoes, reservado);

      if (!prateleiraDisponivel) {
        toast.error("Produto não disponível na prateleira");
        setBarcode("");
        return;
      }

      // Aplicar desconto promocional se houver
      const { precoFinal, temDesconto } = getPrecoComDesconto(
        prateleiraDisponivel.preco_venda_prateleira,
        produto.id
      );

      addToCartWithPrice({
        produto_id: produto.id,
        nome: produto.nome,
        preco: precoFinal,
        preco_original: temDesconto ? prateleiraDisponivel.preco_venda_prateleira : undefined,
        codigo_barras: produto.codigo_barras || "",
        prateleira_id: prateleiraDisponivel.id,
      });

      // Toca beep de sucesso
      playBeep();
      toast.success(`${produto.nome} adicionado`);
    } catch (error) {
      console.error("Erro ao buscar produto:", error);
      toast.error("Erro ao buscar produto");
    }

    setBarcode("");
  };

  // Handler para formulário (Enter ou submit manual)
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addProductByBarcode(barcode);
  };

  // Handler para código detectado pela câmera - adiciona automaticamente
  const handleCameraDetected = async (code: string) => {
    setShowCameraScanner(false);
    await addProductByBarcode(code);
  };

  // Agrupar itens por produto_id para detectar múltiplos preços
  const produtosComMultiplosPrecos = new Set<number>();
  const produtoPrecos = new Map<number, Set<number>>();
  
  cart.forEach((item) => {
    if (!produtoPrecos.has(item.produto_id)) {
      produtoPrecos.set(item.produto_id, new Set());
    }
    produtoPrecos.get(item.produto_id)!.add(item.preco);
  });

  produtoPrecos.forEach((precos, produtoId) => {
    if (precos.size > 1) {
      produtosComMultiplosPrecos.add(produtoId);
    }
  });

  // Identificar preço mais barato de cada produto
  const precoMaisBarato = new Map<number, number>();
  produtoPrecos.forEach((precos, produtoId) => {
    precoMaisBarato.set(produtoId, Math.min(...precos));
  });

  const getTotalComPromocoes = () => {
    return cart.reduce((sum, item) => sum + item.preco * item.quantidade, 0);
  };

  const total = getTotalComPromocoes();

  const temMultiplosPrecos = produtosComMultiplosPrecos.size > 0;

  // Função para verificar se é linha mais cara
  const isLinhaMaisCara = (item: CartItem) => {
    if (!produtosComMultiplosPrecos.has(item.produto_id)) return false;
    const menorPreco = precoMaisBarato.get(item.produto_id);
    return item.preco > (menorPreco || 0);
  };

  // Handler para incrementar quantidade com verificação de estoque
  const handleIncrement = async (item: CartItem) => {
    const mercadinhoId = mercadinhoAtualId || 1;
    
    // Buscar exposições atualizadas
    const exposicoes = await buscarExposicoesProduto(mercadinhoId, item.produto_id);
    const totalDisponivel = await totalDisponivelProduto(mercadinhoId, item.produto_id);
    
    const totalNoCarrinho = cart
      .filter((i) => i.produto_id === item.produto_id)
      .reduce((sum, i) => sum + i.quantidade, 0);

    if (totalNoCarrinho >= totalDisponivel) {
      toast.error("Quantidade máxima disponível em estoque");
      return;
    }

    // Verificar se essa prateleira específica ainda tem estoque
    const reservado = getQuantidadeReservadaPorPrateleira(item.produto_id);
    const expo = exposicoes.find((e) => e.id === item.prateleira_id);
    
    if (expo) {
      const jaReservado = reservado.get(expo.id) || 0;
      if (expo.quantidade_prateleira - jaReservado > 0) {
        updateQuantity(item.produto_id, item.quantidade + 1, item.preco);
        return;
      }
    }

    // Se não tem mais nessa prateleira, tenta adicionar de outra
    const prateleiraDisponivel = encontrarProximaPrateleiraDisponivel(exposicoes, reservado);
    
    if (prateleiraDisponivel) {
      const { precoFinal, temDesconto } = getPrecoComDesconto(
        prateleiraDisponivel.preco_venda_prateleira,
        item.produto_id
      );

      addToCartWithPrice({
        produto_id: item.produto_id,
        nome: item.nome,
        preco: precoFinal,
        preco_original: temDesconto ? prateleiraDisponivel.preco_venda_prateleira : undefined,
        codigo_barras: item.codigo_barras,
        prateleira_id: prateleiraDisponivel.id,
      });
    } else {
      toast.error("Quantidade máxima disponível em estoque");
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <AlertDialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar compra?</AlertDialogTitle>
            <AlertDialogDescription>
              O carrinho será limpo e você voltará para a tela inicial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar comprando</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelPurchase}>
              Cancelar compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBackClick}>
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Carrinho</h1>
              <p className="text-lg text-muted-foreground">{clienteNome}</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-4xl font-bold text-primary">R$ {total.toFixed(2)}</p>
          </div>
        </div>

        <form id="barcode-form" onSubmit={handleBarcodeSubmit} className="bg-card p-4 rounded-lg border">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              type="text"
              inputMode="none"
              readOnly={!keyboardOpen}
              placeholder="Escaneie o código de barras..."
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onBlur={() => {
                // Fechar modo teclado quando o input perde foco
                setKeyboardOpen(false);
              }}
              className="text-lg flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowCameraScanner(true)}
              title="Ler pela câmera"
            >
              <Camera className="w-5 h-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleOpenKeyboard}
              title="Digitar manualmente"
            >
              <Keyboard className="w-5 h-5" />
            </Button>
          </div>
        </form>

        {/* Camera Scanner Modal */}
        {showCameraScanner && (
          <CameraScanner
            onDetected={handleCameraDetected}
            onClose={() => setShowCameraScanner(false)}
            title="Escaneie o produto"
          />
        )}

        <div className="space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Carrinho vazio. Escaneie um produto para começar.
            </div>
          ) : (
            cart.map((item, index) => (
              <div
                key={`${item.produto_id}_${item.preco}_${index}`}
                className={`p-4 rounded-lg border flex items-center gap-4 ${
                  isLinhaMaisCara(item)
                    ? "bg-destructive/10 border-destructive/30"
                    : "bg-card"
                }`}
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">
                    {item.nome}
                    {item.preco_original && (
                      <span className="ml-2 text-xs bg-green-500/20 text-green-600 px-2 py-0.5 rounded">
                        PROMO
                      </span>
                    )}
                    {isLinhaMaisCara(item) && (
                      <span className="ml-2 text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded">
                        LOTE DIFERENTE
                      </span>
                    )}
                  </h3>
                  <p className="text-muted-foreground">
                    {item.preco_original && (
                      <span className="line-through mr-2">
                        R$ {item.preco_original.toFixed(2)}
                      </span>
                    )}
                    R$ {item.preco.toFixed(2)} x {item.quantidade}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      updateQuantity(
                        item.produto_id,
                        Math.max(0, item.quantidade - 1),
                        item.preco
                      )
                    }
                  >
                    <Minus className="w-4 h-4" />
                  </Button>

                  <span className="text-2xl font-bold w-12 text-center">
                    {item.quantidade}
                  </span>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleIncrement(item)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => removeFromCart(item.produto_id, item.preco)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="text-right w-32">
                  <p className="text-2xl font-bold">
                    R$ {(item.preco * item.quantidade).toFixed(2)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {temMultiplosPrecos && (
          <div className="flex items-center gap-2 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">
              <strong>Atenção:</strong> itens iguais com preços diferentes por terem preço de custo diferente.
            </p>
          </div>
        )}

        {cart.length > 0 && (
          <Button
            size="lg"
            className="w-full text-xl py-8"
            onClick={() => navigate("/checkout")}
          >
            Finalizar Compra
          </Button>
        )}
      </div>
    </div>
  );
};

export default Cart;

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
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

interface Promocao {
  id: number;
  desconto_percentual: number;
  tipo: string;
  produto_id: number | null;
}

const Cart = () => {
  const navigate = useNavigate();
  const { clienteNome, cart, addToCart, updateQuantity, removeFromCart, getTotal, reset } = useCheckout();
  const [barcode, setBarcode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleBackClick = () => {
    if (cart.length > 0) {
      setShowCancelModal(true);
    } else {
      navigate('/');
    }
  };

  const handleCancelPurchase = () => {
    reset();
    setShowCancelModal(false);
    navigate('/');
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, [cart]);

  useEffect(() => {
    loadPromocoes();
  }, []);

  const loadPromocoes = async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('promocoes')
      .select('id, desconto_percentual, tipo, produto_id')
      .eq('ativa', true)
      .lte('inicia_em', now)
      .or(`termina_em.is.null,termina_em.gte.${now}`);
    
    setPromocoes(data || []);
  };

  const getPromoForProduct = (produtoId: number): Promocao | null => {
    // Primeiro tenta encontrar promoção específica do produto
    const produtoPromo = promocoes.find(p => p.tipo === 'produto' && p.produto_id === produtoId);
    if (produtoPromo) return produtoPromo;
    
    // Se não, busca promoção global
    const globalPromo = promocoes.find(p => p.tipo === 'global');
    return globalPromo || null;
  };

  const getPrecoComDesconto = (preco: number, produtoId: number): { precoFinal: number; temDesconto: boolean; desconto: number } => {
    const promo = getPromoForProduct(produtoId);
    if (promo) {
      const precoFinal = preco * (1 - promo.desconto_percentual / 100);
      return { precoFinal, temDesconto: true, desconto: promo.desconto_percentual };
    }
    return { precoFinal: preco, temDesconto: false, desconto: 0 };
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;

    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .eq('codigo_barras', barcode.trim())
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const { precoFinal, temDesconto } = getPrecoComDesconto(data.preco_venda, data.id);
        addToCart({
          produto_id: data.id,
          nome: data.nome,
          preco: precoFinal,
          preco_original: temDesconto ? data.preco_venda : undefined,
          codigo_barras: data.codigo_barras || ''
        });
        toast.success(`${data.nome} adicionado`);
      } else {
        toast.error('Produto não encontrado');
      }
    } catch (error) {
      console.error('Erro ao buscar produto:', error);
      toast.error('Erro ao buscar produto');
    }

    setBarcode('');
  };

  const getTotalComPromocoes = () => {
    return cart.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
  };

  const total = getTotalComPromocoes();

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
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackClick}
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Carrinho</h1>
              <p className="text-lg text-muted-foreground">{clienteNome}</p>
            </div>
          </div>
          
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-4xl font-bold text-primary">
              R$ {total.toFixed(2)}
            </p>
          </div>
        </div>

        <form onSubmit={handleBarcodeSubmit} className="bg-card p-4 rounded-lg border">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Escaneie o código de barras..."
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            className="text-lg"
          />
        </form>

        <div className="space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Carrinho vazio. Escaneie um produto para começar.
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.produto_id} className="bg-card p-4 rounded-lg border flex items-center gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">
                    {item.nome}
                    {item.preco_original && (
                      <span className="ml-2 text-xs bg-green-500/20 text-green-600 px-2 py-0.5 rounded">
                        PROMO
                      </span>
                    )}
                  </h3>
                  <p className="text-muted-foreground">
                    {item.preco_original && (
                      <span className="line-through mr-2">R$ {item.preco_original.toFixed(2)}</span>
                    )}
                    R$ {item.preco.toFixed(2)} x {item.quantidade}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => updateQuantity(item.produto_id, Math.max(1, item.quantidade - 1))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  
                  <span className="text-2xl font-bold w-12 text-center">
                    {item.quantidade}
                  </span>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => updateQuantity(item.produto_id, item.quantidade + 1)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => removeFromCart(item.produto_id)}
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

        {cart.length > 0 && (
          <Button
            size="lg"
            className="w-full text-xl py-8"
            onClick={() => navigate('/checkout')}
          >
            Finalizar Compra
          </Button>
        )}
      </div>
    </div>
  );
};

export default Cart;

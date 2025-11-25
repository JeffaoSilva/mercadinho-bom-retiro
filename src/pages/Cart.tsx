import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const Cart = () => {
  const navigate = useNavigate();
  const { clienteNome, cart, addToCart, updateQuantity, removeFromCart, getTotal } = useCheckout();
  const [barcode, setBarcode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [cart]);

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
        addToCart({
          produto_id: data.id,
          nome: data.nome,
          preco: data.preco_venda,
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

  const total = getTotal();

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/select-client')}
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
                  <h3 className="font-semibold text-lg">{item.nome}</h3>
                  <p className="text-muted-foreground">
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

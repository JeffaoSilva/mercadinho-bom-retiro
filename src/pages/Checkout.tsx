import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { ArrowLeft, Book, Smartphone } from "lucide-react";
import { toast } from "sonner";

const Checkout = () => {
  const navigate = useNavigate();
  const { clienteId, isVisitante, cart, getTotal, reset } = useCheckout();
  const [loading, setLoading] = useState(false);

  const total = getTotal();

  const handleFinalizarCompra = async (tipoPagamento: string) => {
    setLoading(true);

    try {
      // Criar compra
      const { data: compra, error: compraError } = await supabase
        .from('compras')
        .insert({
          cliente_id: isVisitante ? null : clienteId,
          mercadinho_id: 1, // TODO: configurar mercadinho_id real
          tipo_pagamento: tipoPagamento,
          valor_total: total,
          eh_visitante: isVisitante
        })
        .select()
        .single();

      if (compraError) throw compraError;

      // Criar itens da compra
      const itens = cart.map(item => ({
        compra_id: compra.id,
        produto_id: item.produto_id,
        valor_unitario: item.preco,
        quantidade: item.quantidade
      }));

      const { error: itensError } = await supabase
        .from('itens_compra')
        .insert(itens);

      if (itensError) throw itensError;

      toast.success('Compra finalizada com sucesso!');
      reset();
      navigate('/');
    } catch (error) {
      console.error('Erro ao finalizar compra:', error);
      toast.error('Erro ao finalizar compra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/cart')}
          className="mb-4"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>

        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Finalizar Compra</h1>
          <p className="text-3xl font-bold text-primary">
            Total: R$ {total.toFixed(2)}
          </p>
        </div>

        <div className="space-y-4">
          {!isVisitante && (
            <Button
              size="lg"
              variant="outline"
              className="w-full h-24 text-2xl"
              onClick={() => handleFinalizarCompra('caderneta')}
              disabled={loading}
            >
              <Book className="w-8 h-8 mr-4" />
              Anotar na Caderneta
            </Button>
          )}

          <Button
            size="lg"
            className="w-full h-24 text-2xl"
            onClick={() => handleFinalizarCompra('pix')}
            disabled={loading}
          >
            <Smartphone className="w-8 h-8 mr-4" />
            Pagar via PIX
          </Button>
        </div>

        <Button
          variant="ghost"
          className="w-full"
          onClick={() => navigate('/cart')}
        >
          Voltar ao Carrinho
        </Button>
      </div>
    </div>
  );
};

export default Checkout;

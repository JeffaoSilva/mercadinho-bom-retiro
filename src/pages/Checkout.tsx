import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { ArrowLeft, Book, Smartphone, CheckCircle, QrCode } from "lucide-react";
import { toast } from "sonner";
import { decrementarPrateleira } from "@/services/prateleiras";

const Checkout = () => {
  const navigate = useNavigate();
  const { clienteId, isVisitante, cart, getTotal, reset, mercadinhoAtualId } = useCheckout();
  const [loading, setLoading] = useState(false);
  const [showPixQR, setShowPixQR] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const total = getTotal();

  const handleFinalizarCompra = async (tipoPagamento: string) => {
    setLoading(true);

    try {
      // Primeiro, verificar e baixar estoque de cada item
      for (const item of cart) {
        if (item.prateleira_id) {
          // Verificar se ainda tem estoque
          const { data: prateleira, error: fetchError } = await supabase
            .from("prateleiras_produtos")
            .select("quantidade_prateleira")
            .eq("id", item.prateleira_id)
            .single();

          if (fetchError || !prateleira) {
            toast.error(`Erro ao verificar estoque de ${item.nome}`);
            setLoading(false);
            return;
          }

          if (prateleira.quantidade_prateleira < item.quantidade) {
            toast.error(`Produto não disponível na prateleira: ${item.nome}`);
            setLoading(false);
            return;
          }
        }
      }

      // Criar compra
      const { data: compra, error: compraError } = await supabase
        .from("compras")
        .insert({
          cliente_id: isVisitante ? null : clienteId,
          mercadinho_id: mercadinhoAtualId || 1,
          tipo_pagamento: tipoPagamento,
          valor_total: total,
          eh_visitante: isVisitante,
        })
        .select()
        .single();

      if (compraError) throw compraError;

      // Criar itens da compra
      const itens = cart.map((item) => ({
        compra_id: compra.id,
        produto_id: item.produto_id,
        valor_unitario: item.preco,
        quantidade: item.quantidade,
        valor_total: item.preco * item.quantidade,
      }));

      const { error: itensError } = await supabase.from("itens_compra").insert(itens);

      if (itensError) throw itensError;

      // Baixar estoque das prateleiras
      for (const item of cart) {
        if (item.prateleira_id) {
          const sucesso = await decrementarPrateleira(item.prateleira_id, item.quantidade);
          if (!sucesso) {
            console.error(`Erro ao baixar estoque do item ${item.nome}`);
            // Não aborta pois a compra já foi registrada
          }
        }
      }

      setShowSuccess(true);
      toast.success("Compra finalizada com sucesso!");

      // Aguardar 2 segundos antes de limpar e redirecionar
      setTimeout(() => {
        reset();
        navigate("/");
      }, 2000);
    } catch (error) {
      console.error("Erro ao finalizar compra:", error);
      toast.error("Erro ao finalizar compra");
    } finally {
      setLoading(false);
    }
  };

  const handlePixClick = () => {
    setShowPixQR(true);
  };

  const handleConfirmarPix = () => {
    handleFinalizarCompra("pix");
  };

  // Tela de sucesso
  if (showSuccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="text-center space-y-6">
          <CheckCircle className="w-24 h-24 text-green-500 mx-auto" />
          <h1 className="text-4xl font-bold text-green-600">Compra Finalizada!</h1>
          <p className="text-xl text-muted-foreground">Obrigado pela sua compra</p>
          <p className="text-muted-foreground">Redirecionando...</p>
        </div>
      </div>
    );
  }

  // Tela de QR Code PIX
  if (showPixQR) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowPixQR(false)}
            className="mb-4"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>

          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold">Pagamento PIX</h1>
            <p className="text-2xl font-bold text-primary">R$ {total.toFixed(2)}</p>
          </div>

          {/* QR Code Placeholder */}
          <div className="bg-white p-8 rounded-xl shadow-lg mx-auto w-fit">
            <div className="w-64 h-64 border-4 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center bg-muted/20">
              <QrCode className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground text-center px-4">
                QR Code PIX será gerado aqui quando a chave PIX for configurada
              </p>
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>Escaneie o QR Code acima com o app do seu banco</p>
          </div>

          <div className="space-y-4">
            <Button
              size="lg"
              className="w-full h-16 text-xl"
              onClick={handleConfirmarPix}
              disabled={loading}
            >
              {loading ? "Processando..." : "Confirmar Pagamento"}
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowPixQR(false)}
              disabled={loading}
            >
              Voltar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Tela principal de checkout
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/cart")}
          className="mb-4"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>

        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Finalizar Compra</h1>
          <p className="text-3xl font-bold text-primary">Total: R$ {total.toFixed(2)}</p>
        </div>

        <div className="space-y-4">
          {/* Opção Caderneta - apenas para clientes logados */}
          {!isVisitante && (
            <Button
              size="lg"
              variant="outline"
              className="w-full h-24 text-2xl"
              onClick={() => handleFinalizarCompra("caderneta")}
              disabled={loading}
            >
              <Book className="w-8 h-8 mr-4" />
              Anotar na Caderneta
            </Button>
          )}

          {/* Opção PIX - para todos */}
          <Button
            size="lg"
            className="w-full h-24 text-2xl"
            onClick={handlePixClick}
            disabled={loading}
          >
            <Smartphone className="w-8 h-8 mr-4" />
            Pagar via PIX
          </Button>
        </div>

        <Button variant="ghost" className="w-full" onClick={() => navigate("/cart")}>
          Voltar ao Carrinho
        </Button>
      </div>
    </div>
  );
};

export default Checkout;

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { Book, Smartphone, CheckCircle, AlertTriangle } from "lucide-react";
import BackButton from "@/components/BackButton";
import PixPagamento from "@/components/PixPagamento";
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

const Checkout = () => {
  const navigate = useNavigate();
  const {
    clienteId,
    clienteNome,
    isVisitante,
    isAdminPurchase,
    cart,
    getTotal,
    reset,
    mercadinhoAtualId,
    tabletId,
    getHomePath,
  } = useCheckout();

  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPix, setShowPix] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState<"caderneta" | "pix" | null>(null);

  const total = getTotal();

  // Itens do PIX: somente identificadores. Preço/total são definidos no backend.
  const itensPix = useMemo(
    () =>
      cart
        .filter((i) => !!i.prateleira_id)
        .map((i) => ({
          prateleira_id: i.prateleira_id as number,
          quantidade: i.quantidade,
        })),
    [cart]
  );

  const mercadinhoNome = mercadinhoAtualId === 1 ? "Bom Retiro" : mercadinhoAtualId === 2 ? "São Francisco" : "Desconhecido";

  const handleRequestPayment = (forma: "caderneta" | "pix") => {
    if (isAdminPurchase) {
      setConfirmPayment(forma);
    } else if (forma === "pix") {
      handlePixClick();
    } else {
      handleFinalizarCompra(forma);
    }
  };

  // Usado apenas por formas de pagamento não-PIX (caderneta).
  const handleFinalizarCompra = async (formaPagamento: "caderneta") => {
    // Bloqueio de múltiplos cliques / chamadas concorrentes
    if (isProcessing) return;
    setIsProcessing(true);
    setConfirmPayment(null);
    setLoading(true);

    try {
      const payload = {
        cliente_id: isVisitante ? null : clienteId,
        mercadinho_id: mercadinhoAtualId || 1,
        tablet_id: tabletId ? parseInt(tabletId) : null,
        forma_pagamento: formaPagamento,
        eh_visitante: isVisitante,
        valor_total: total,
        itens: cart.map((item) => ({
          produto_id: item.produto_id,
          prateleira_id: item.prateleira_id || null,
          quantidade: item.quantidade,
          valor_unitario: item.preco,
          valor_total: item.preco * item.quantidade,
        })),
      };

      const { data, error } = await supabase.rpc("criar_compra_kiosk", {
        payload,
      });

      if (error) throw error;

      const result = data as {
        ok: boolean;
        compra_id?: number;
        erro?: string;
        produto_id?: number;
        produto_nome?: string;
      } | null;

      if (!result?.ok) {
        // Erro de estoque vindo do backend: redireciona ao carrinho com destaque
        if (result?.erro === "Estoque insuficiente" && result?.produto_id) {
          const nome = result.produto_nome || "Produto";
          toast.error(`O produto ${nome} está sem estoque. Remova para continuar.`, {
            duration: 6000,
          });
          setLoading(false);
          setIsProcessing(false);
          navigate("/cart", {
            state: {
              estoqueErroProdutoId: result.produto_id,
              estoqueErroProdutoNome: nome,
            },
          });
          return;
        }
        throw new Error(result?.erro || "Falha ao criar compra");
      }

      setShowSuccess(true);

      setTimeout(() => {
        reset();
        if (isAdminPurchase) {
          navigate("/admin");
        } else {
          navigate(getHomePath());
        }
      }, 2000);
    } catch (error) {
      console.error("Erro ao finalizar compra:", error);
      toast.error("Erro ao finalizar compra");
      setIsProcessing(false);
    } finally {
      setLoading(false);
    }
  };

  const handlePixClick = () => {
    if (isVisitante || !clienteId) {
      toast.error("Para pagar com PIX é preciso identificar o cliente.");
      return;
    }
    if (itensPix.length === 0 || itensPix.length !== cart.length) {
      toast.error("Um dos produtos do carrinho não pode ser pago por PIX.");
      return;
    }
    setShowPix(true);
  };

  // Pagamento confirmado pelo webhook: a venda já foi criada no backend.
  const handlePixPago = () => {
    setTimeout(() => {
      reset();
      if (isAdminPurchase) {
        navigate("/admin");
      } else {
        navigate(getHomePath());
      }
    }, 4000);
  };

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

  if (showPix) {
    return (
      <PixPagamento
        mercadinhoId={mercadinhoAtualId || 1}
        tabletId={tabletId ? parseInt(tabletId) : null}
        clienteId={clienteId}
        itens={itensPix}
        total={total}
        onVoltar={() => setShowPix(false)}
        onPago={handlePixPago}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <BackButton to="/cart" />

        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Finalizar Compra</h1>
          <p className="text-3xl font-bold text-primary">Total: R$ {total.toFixed(2)}</p>
        </div>

        <div className="space-y-4">
          {!isVisitante && (
            <Button
              size="lg"
              variant="outline"
              className="w-full h-24 text-2xl"
              onClick={() => handleRequestPayment("caderneta")}
              disabled={loading || isProcessing}
            >
              <Book className="w-8 h-8 mr-4" />
              Anotar na Caderneta
            </Button>
          )}

          <Button
            size="lg"
            variant="outline"
            className="w-full h-24 text-2xl"
            onClick={() => handleRequestPayment("pix")}
            disabled={loading || isProcessing}
          >
            <Smartphone className="w-8 h-8 mr-4" />
            Pagar com PIX
          </Button>
        </div>

        <Button variant="outline" className="w-full" onClick={() => navigate("/cart")}>
          Voltar ao Carrinho
        </Button>
      </div>

      {/* Confirmação admin */}
      <AlertDialog open={!!confirmPayment} onOpenChange={(open) => !open && setConfirmPayment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirmar Lançamento
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-base">
                <p><strong>Cliente:</strong> {clienteNome}</p>
                <p><strong>Mercadinho:</strong> {mercadinhoNome}</p>
                <p><strong>Pagamento:</strong> {confirmPayment === "caderneta" ? "Caderneta" : "PIX"}</p>
                <p><strong>Total:</strong> R$ {total.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground pt-2">
                  Confirme que os dados estão corretos antes de lançar.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmPayment === "pix") {
                setConfirmPayment(null);
                handlePixClick();
              } else {
                handleFinalizarCompra("caderneta");
              }
            }}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Checkout;

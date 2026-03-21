import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { Book, Smartphone, CheckCircle, QrCode } from "lucide-react";
import BackButton from "@/components/BackButton";
import { toast } from "sonner";

const Checkout = () => {
  const navigate = useNavigate();
  const {
    clienteId,
    isVisitante,
    cart,
    getTotal,
    reset,
    mercadinhoAtualId,
    tabletId,
    getHomePath,
  } = useCheckout();

  const [loading, setLoading] = useState(false);
  const [showPixQR, setShowPixQR] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [pixChave, setPixChave] = useState("");
  const [pixQrCodeUrl, setPixQrCodeUrl] = useState("");

  const total = getTotal();

  // Carregar config PIX
  useEffect(() => {
    const loadPixConfig = async () => {
      const { data } = await supabase
        .from("config_sistema")
        .select("pix_chave, pix_qr_code_url")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        setPixChave((data as any).pix_chave || "");
        setPixQrCodeUrl((data as any).pix_qr_code_url || "");
      }
    };
    loadPixConfig();
  }, []);

  const handleFinalizarCompra = async (formaPagamento: "caderneta" | "pix") => {
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

      const result = data as { ok: boolean; compra_id: number } | null;
      if (!result?.ok) {
        throw new Error("Falha ao criar compra");
      }

      setShowSuccess(true);

      setTimeout(() => {
        reset();
        navigate(getHomePath());
      }, 2000);
    } catch (error) {
      console.error("Erro ao finalizar compra:", error);
      toast.error("Erro ao finalizar compra");
    } finally {
      setLoading(false);
    }
  };

  const handlePixClick = () => setShowPixQR(true);
  const handleConfirmarPix = () => handleFinalizarCompra("pix");


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

  if (showPixQR) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <BackButton onClick={() => setShowPixQR(false)} />

          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold">Pagamento PIX</h1>
            <p className="text-lg text-muted-foreground">
              Agora realize o pagamento via Pix no valor de
            </p>
            <p className="text-3xl font-bold text-foreground">
              R$ {total.toFixed(2)}
            </p>
            <p className="text-2xl text-muted-foreground">
              Só após pagar via PIX, clique no botão abaixo "Confirmar pagamento".
            </p>
          </div>

          {/* QR Code + Chave Pix */}
          <div className="flex flex-col items-center gap-3">
            {pixQrCodeUrl ? (
              <div className="bg-white p-4 rounded-xl shadow-lg">
                <img
                  src={pixQrCodeUrl}
                  alt="QR Code PIX"
                  className="w-64 h-64 object-contain"
                />
              </div>
            ) : (
              <div className="bg-white p-8 rounded-xl shadow-lg">
                <div className="w-64 h-64 border-4 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center bg-muted/20">
                  <QrCode className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground text-center px-4">
                    QR Code não configurado
                  </p>
                </div>
              </div>
            )}
            {pixChave && (
              <p className="text-base font-semibold text-foreground text-center">
                {pixChave}
              </p>
            )}
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
              onClick={() => handleFinalizarCompra("caderneta")}
              disabled={loading}
            >
              <Book className="w-8 h-8 mr-4" />
              Anotar na Caderneta
            </Button>
          )}

          <Button
            size="lg"
            variant="outline"
            className="w-full h-24 text-2xl"
            onClick={handlePixClick}
            disabled={loading}
          >
            <Smartphone className="w-8 h-8 mr-4" />
            Registrar compra e pagar no Pix
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

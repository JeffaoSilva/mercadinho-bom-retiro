import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { ArrowLeft, Delete } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const Pin = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const checkout = useCheckout();
  const { clienteId: clienteIdStore, clienteNome: clienteNomeStore } = checkout;

  // dados que podem vir via navigate("/pin", { state: {...} })
  const state = (location.state as any) || {};
  const clienteIdState = state.clienteId as number | undefined;
  const clienteNomeState = state.clienteNome as string | undefined;
  const destino = state.destino as string | undefined; // "areaCliente" ou undefined

  // usa store primeiro; se não tiver, usa state
  const clienteId = clienteIdStore || clienteIdState;
  const clienteNome = clienteNomeStore || clienteNomeState || "";

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"pin" | "confirm">("pin");
  const [clienteTemPin, setClienteTemPin] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const checkHasPin = async () => {
      if (!clienteId) return;

      const { data: hasPin, error } = await supabase.rpc("pin_has_any", {
        p_cliente_id: clienteId,
      });

      if (error) {
        console.error("Erro ao verificar PIN:", error);
        setClienteTemPin(true);
        return;
      }

      setClienteTemPin(hasPin);
    };

    checkHasPin();
  }, [clienteId]);

  const irDepoisDoPin = () => {
    if (destino === "areaCliente") {
      navigate(`/area-cliente/${clienteId}`);
    } else {
      navigate("/cart");
    }
  };

  const processarPin = async (pinAtual: string) => {
    if (!clienteId) {
      toast.error("Cliente não identificado");
      return;
    }

    if (pinAtual.length !== 4 || isProcessing) return;

    // Primeiro acesso: criar PIN (fluxo de 2 etapas)
    if (clienteTemPin === false) {
      if (step === "pin") {
        setStep("confirm");
        return;
      }

      // Estamos na etapa de confirmação
      if (pinAtual !== pin) {
        toast.error("PINs não coincidem");
        setConfirmPin("");
        return;
      }

      // PINs coincidem, criar
      setIsProcessing(true);
      try {
        const { error } = await supabase.rpc("pin_create", {
          p_cliente_id: clienteId,
          p_pin: pin,
        });

        if (error) throw error;

        irDepoisDoPin();
      } catch (error) {
        console.error("Erro ao criar PIN:", error);
        toast.error("Erro ao criar PIN");
        setConfirmPin("");
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Acesso normal: validar PIN
    setIsProcessing(true);
    try {
      const { data: ok, error } = await supabase.rpc("pin_validate", {
        p_cliente_id: clienteId,
        p_pin: pinAtual,
      });

      if (error) {
        console.error("Erro ao validar PIN:", error);
        toast.error("Erro ao validar PIN");
        setPin("");
        return;
      }

      if (ok) {
        irDepoisDoPin();
      } else {
        toast.error("PIN inválido");
        setPin("");
      }
    } catch (error) {
      console.error("Erro ao validar PIN:", error);
      toast.error("Erro ao validar PIN");
      setPin("");
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-processar quando PIN atinge 4 dígitos
  useEffect(() => {
    const currentPin = step === "confirm" ? confirmPin : pin;
    if (currentPin.length === 4) {
      processarPin(currentPin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, confirmPin]);

  const adicionarDigito = (d: string) => {
    if (step === "confirm") {
      setConfirmPin((prev) => (prev.length < 4 ? prev + d : prev));
    } else {
      setPin((prev) => (prev.length < 4 ? prev + d : prev));
    }
  };

  const apagarDigito = () => {
    if (step === "confirm") {
      setConfirmPin((prev) => prev.slice(0, -1));
    } else {
      setPin((prev) => prev.slice(0, -1));
    }
  };

  const currentPin = step === "confirm" ? confirmPin : pin;

  const voltar = () => {
    if (destino === "areaCliente") {
      navigate("/area-cliente");
    } else {
      navigate("/select-client");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={voltar}
          className="mb-4"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>

        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">{clienteNome}</h1>
          <p className="text-xl text-muted-foreground">
            {clienteTemPin === false
              ? step === "pin"
                ? "Crie seu PIN (4 dígitos)"
                : "Confirme seu PIN"
              : "Digite seu PIN"}
          </p>
        </div>

        {/* OTP Display - readOnly, sem teclado do sistema */}
        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className={cn(
                "w-14 h-14 border-2 rounded-lg flex items-center justify-center text-2xl font-bold transition-all",
                index === currentPin.length
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-input",
                currentPin[index] ? "bg-muted" : "bg-background"
              )}
            >
              {currentPin[index] ? "•" : ""}
            </div>
          ))}
        </div>

        {/* Teclado numérico fixo */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto mt-8">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <Button
              key={n}
              variant="outline"
              className="h-16 text-2xl font-semibold"
              onClick={() => adicionarDigito(String(n))}
              disabled={isProcessing}
            >
              {n}
            </Button>
          ))}

          <Button
            variant="outline"
            className="h-16 text-2xl"
            onClick={apagarDigito}
            disabled={isProcessing}
          >
            <Delete className="w-6 h-6" />
          </Button>

          <Button
            variant="outline"
            className="h-16 text-2xl font-semibold"
            onClick={() => adicionarDigito("0")}
            disabled={isProcessing}
          >
            0
          </Button>

          <div />
        </div>
      </div>
    </div>
  );
};

export default Pin;

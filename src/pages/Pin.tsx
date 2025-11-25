import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const Pin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const action = searchParams.get('action');
  const { clienteId, clienteNome } = useCheckout();
  
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'pin' | 'confirm'>('pin');

  const handleCreatePin = async () => {
    if (step === 'pin') {
      if (pin.length !== 4) {
        toast.error('PIN deve ter 4 dígitos');
        return;
      }
      setStep('confirm');
      return;
    }

    if (confirmPin !== pin) {
      toast.error('PINs não coincidem');
      setConfirmPin('');
      return;
    }

    try {
      const { error } = await supabase
        .from('pins')
        .insert({ cliente_id: clienteId!, pin });

      if (error) throw error;
      toast.success('PIN criado com sucesso!');
      navigate('/cart');
    } catch (error) {
      console.error('Erro ao criar PIN:', error);
      toast.error('Erro ao criar PIN');
    }
  };

  const handleValidatePin = async () => {
    if (pin.length !== 4) {
      toast.error('PIN deve ter 4 dígitos');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('pins')
        .select('pin')
        .eq('cliente_id', clienteId!)
        .single();

      if (error) throw error;

      if (data.pin === pin) {
        toast.success('PIN correto!');
        navigate('/cart');
      } else {
        toast.error('PIN incorreto');
        setPin('');
      }
    } catch (error) {
      console.error('Erro ao validar PIN:', error);
      toast.error('Erro ao validar PIN');
    }
  };

  const handleSubmit = () => {
    if (action === 'create') {
      handleCreatePin();
    } else {
      handleValidatePin();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/select-client')}
          className="mb-4"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>

        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">
            {clienteNome}
          </h1>
          <p className="text-xl text-muted-foreground">
            {action === 'create' 
              ? step === 'pin' ? 'Crie seu PIN (4 dígitos)' : 'Confirme seu PIN'
              : 'Digite seu PIN'}
          </p>
        </div>

        <div className="flex justify-center">
          <InputOTP
            maxLength={4}
            value={step === 'confirm' ? confirmPin : pin}
            onChange={(value) => step === 'confirm' ? setConfirmPin(value) : setPin(value)}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          size="lg"
          className="w-full text-xl py-6"
          onClick={handleSubmit}
          disabled={(step === 'confirm' ? confirmPin : pin).length !== 4}
        >
          {action === 'create' && step === 'pin' ? 'Próximo' : 'Confirmar'}
        </Button>
      </div>
    </div>
  );
};

export default Pin;

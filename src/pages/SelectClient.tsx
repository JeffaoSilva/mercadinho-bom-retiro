import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { ArrowLeft, User } from "lucide-react";
import { toast } from "sonner";

interface Cliente {
  id: string;
  nome: string;
}

const SelectClient = () => {
  const navigate = useNavigate();
  const { setCliente, setVisitante } = useCheckout();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClientes();
  }, []);

  const loadClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome')
        .order('nome');

      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCliente = async (cliente: Cliente) => {
    setCliente(cliente.id, cliente.nome);
    
    // Verificar se cliente tem PIN
    const { data } = await supabase
      .from('pins')
      .select('pin')
      .eq('cliente_id', cliente.id)
      .maybeSingle();

    if (data) {
      navigate('/pin?action=validate');
    } else {
      navigate('/pin?action=create');
    }
  };

  const handleVisitante = () => {
    setVisitante();
    navigate('/cart');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xl text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-4xl font-bold">Selecione o Cliente</h1>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {clientes.map((cliente) => (
            <Button
              key={cliente.id}
              variant="outline"
              className="h-24 text-xl justify-start px-8"
              onClick={() => handleSelectCliente(cliente)}
            >
              <User className="w-6 h-6 mr-4" />
              {cliente.nome}
            </Button>
          ))}
        </div>

        <div className="flex gap-4 pt-8">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1 h-20 text-xl"
            onClick={handleVisitante}
          >
            VISITANTE
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SelectClient;

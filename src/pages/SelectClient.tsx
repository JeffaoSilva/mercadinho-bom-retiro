import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { ArrowLeft, User } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Cliente {
  id: number;
  nome: string;
}

const MERCADINHOS = [
  { id: 1, nome: "Casa Bom Retiro" },
  { id: 2, nome: "Casa São Francisco" },
];

const SelectClient = () => {
  const navigate = useNavigate();
  const { setCliente, setVisitante, mercadinhoAtualId } = useCheckout();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [mercadinhoSelecionado, setMercadinhoSelecionado] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadClientes();
  }, [mercadinhoSelecionado, mercadinhoAtualId]);

  const loadClientes = async () => {
    try {
      const filtroId = mercadinhoSelecionado ?? mercadinhoAtualId;
      
      if (!filtroId) {
        setClientes([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('clientes_kiosk')
        .select('id, nome')
        .eq('mercadinho_id', filtroId)
        .eq('ativo', true)
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

  const handleSelectCliente = (cliente: Cliente) => {
    setCliente(cliente.id, cliente.nome);
    navigate('/pin');
  };

  const handleVisitante = () => {
    setVisitante();
    navigate('/cart');
  };

  const handleSelectMercadinho = (mercadinhoId: number) => {
    setMercadinhoSelecionado(mercadinhoId);
    setShowModal(false);
    setLoading(true);
  };

  const handleVoltar = () => {
    setMercadinhoSelecionado(null);
    setLoading(true);
  };

  const mercadinhoAtualNome = MERCADINHOS.find(m => m.id === (mercadinhoSelecionado ?? mercadinhoAtualId))?.nome;

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
          <div>
            <h1 className="text-4xl font-bold">Selecione o Cliente</h1>
            {mercadinhoAtualNome && (
              <p className="text-muted-foreground">{mercadinhoAtualNome}</p>
            )}
          </div>
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
          {mercadinhoSelecionado ? (
            <Button
              variant="outline"
              size="lg"
              className="flex-1 h-20 text-xl"
              onClick={handleVoltar}
            >
              Voltar
            </Button>
          ) : (
            <Button
              variant="outline"
              size="lg"
              className="flex-1 h-20 text-xl"
              onClick={() => setShowModal(true)}
            >
              Outros clientes
            </Button>
          )}
          
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

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center">Selecione a Casa</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {MERCADINHOS.map((mercadinho) => (
              <Button
                key={mercadinho.id}
                variant="outline"
                size="lg"
                className="h-20 text-xl"
                onClick={() => handleSelectMercadinho(mercadinho.id)}
              >
                {mercadinho.nome}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SelectClient;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCheckout } from "@/hooks/useCheckout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { User, Store, Loader2 } from "lucide-react";
import BackButton from "@/components/BackButton";
import { toast } from "sonner";

interface Cliente {
  id: number;
  nome: string;
}

const MERCADINHOS = [
  { id: 1, nome: "Bom Retiro" },
  { id: 2, nome: "São Francisco" },
];

const AdminLancarCompra = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  const { setCliente, setMercadinhoAtualId, setAdminPurchase, reset } = useCheckout();

  const [step, setStep] = useState<"mercadinho" | "cliente">("mercadinho");
  const [mercadinhoId, setMercadinhoId] = useState<number | null>(null);
  const [mercadinhoNome, setMercadinhoNome] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/admin");
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Limpar estado ao entrar
  useEffect(() => {
    reset();
  }, []);

  const handleSelectMercadinho = (id: number, nome: string) => {
    setMercadinhoId(id);
    setMercadinhoNome(nome);
    setStep("cliente");
    loadClientes(id);
  };

  const loadClientes = async (mercId: number) => {
    setLoadingClientes(true);
    try {
      const { data, error } = await supabase
        .from("clientes_kiosk")
        .select("id, nome")
        .eq("mercadinho_id", mercId)
        .eq("ativo", true)
        .order("nome");

      if (error) throw error;
      setClientes(data || []);
    } catch (error) {
      console.error("Erro ao carregar clientes:", error);
      toast.error("Erro ao carregar clientes");
    } finally {
      setLoadingClientes(false);
    }
  };

  const handleSelectCliente = (cliente: Cliente) => {
    // Configurar estado completo antes de navegar
    setMercadinhoAtualId(mercadinhoId!);
    setCliente(cliente.id, cliente.nome);
    setAdminPurchase(true);
    navigate("/cart");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (step === "mercadinho") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="flex items-center gap-4">
            <BackButton to="/admin" />
            <h1 className="text-3xl font-bold">Lançar Compra</h1>
          </div>

          <p className="text-lg text-muted-foreground">Selecione o mercadinho:</p>

          <div className="grid grid-cols-1 gap-4">
            {MERCADINHOS.map((m) => (
              <Button
                key={m.id}
                variant="outline"
                className="h-24 text-2xl"
                onClick={() => handleSelectMercadinho(m.id, m.nome)}
              >
                <Store className="w-8 h-8 mr-4" />
                {m.nome}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <BackButton onClick={() => { setStep("mercadinho"); setMercadinhoId(null); }} />
          <div>
            <h1 className="text-3xl font-bold">Selecione o Cliente</h1>
            <p className="text-muted-foreground">{mercadinhoNome}</p>
          </div>
        </div>

        {loadingClientes ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
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
            {clientes.length === 0 && (
              <p className="text-muted-foreground col-span-2 text-center py-8">
                Nenhum cliente encontrado para este mercadinho.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLancarCompra;

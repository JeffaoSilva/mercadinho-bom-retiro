import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShoppingCart, Settings } from "lucide-react";
import { useEffect } from "react";
import { useCheckout } from "@/hooks/useCheckout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTabletId, setMercadinhoAtualId } = useCheckout();

  useEffect(() => {
    const loadTabletData = async () => {
      const tabletIdParam = searchParams.get('tablet_id');
      const tabletId = tabletIdParam || '1';
      setTabletId(tabletId);

      // Buscar mercadinho_id do tablet
      try {
        const { data, error } = await supabase
          .from('tablets')
          .select('mercadinho_id')
          .eq('id', parseInt(tabletId))
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setMercadinhoAtualId(data.mercadinho_id);
        } else {
          toast.error('Tablet não encontrado');
        }
      } catch (error) {
        console.error('Erro ao carregar dados do tablet:', error);
        toast.error('Erro ao carregar dados do tablet');
      }
    };

    loadTabletData();
  }, [searchParams, setTabletId, setMercadinhoAtualId]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="text-center space-y-8 max-w-2xl">
        <div className="space-y-4">
          <ShoppingCart className="w-24 h-24 mx-auto text-primary" />
          <h1 className="text-6xl font-bold text-foreground">
            Mercadinho
          </h1>
          <p className="text-2xl text-muted-foreground">
            Sistema de Autoatendimento
          </p>
        </div>
        
        <Button 
          size="lg"
          onClick={() => navigate('/select-client')}
          className="text-2xl py-8 px-16 h-auto"
        >
          Iniciar Compra
        </Button>
      </div>

      {/* Botão Admin */}
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full opacity-60 hover:opacity-100"
        onClick={() => navigate('/admin')}
      >
        <Settings className="w-6 h-6" />
      </Button>
    </div>
  );
};

export default Index;

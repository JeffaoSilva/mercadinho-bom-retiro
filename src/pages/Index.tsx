import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ShoppingCart, Settings } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useCheckout } from "@/hooks/useCheckout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buscarConfigInatividade } from "@/services/configInatividade";
import { useConfigInatividadeStore } from "@/stores/configInatividadeStore";
import { useIdleStore } from "@/stores/idleStore";
import { useTabletStore } from "@/stores/tabletStore";

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    tabletId: tabletIdStore,
    setTabletId,
    setMercadinhoAtualId,
    getSelectClientPath,
    getAreaClientePath,
  } = useCheckout();

  const setTabletStoreId = useTabletStore((s) => s.setTabletId);
  const setIdleSeconds = useIdleStore((s) => s.setIdleSeconds);
  const setTempos = useConfigInatividadeStore((s) => s.setTempos);
  const setCarregando = useConfigInatividadeStore((s) => s.setCarregando);

  // ✅ resolve tabletId SEM forçar 1 quando já existe no store
  const tabletIdResolvido = useMemo(() => {
    const param = searchParams.get("tablet_id");
    return param || tabletIdStore || "1";
  }, [searchParams, tabletIdStore]);

  useEffect(() => {
    const loadTabletData = async () => {
      const tabletId = tabletIdResolvido;

      // guarda tablet no checkout (string) e no tabletStore (number)
      setTabletId(tabletId);
      setTabletStoreId(parseInt(tabletId));

      // Buscar mercadinho_id do tablet
      try {
        const { data, error } = await supabase
          .from("tablets")
          .select("mercadinho_id")
          .eq("id", parseInt(tabletId))
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setMercadinhoAtualId(data.mercadinho_id);
        } else {
          toast.error("Tablet não encontrado");
        }

        // Carregar config remota de inatividade
        setCarregando(true);
        const cfg = await buscarConfigInatividade(parseInt(tabletId));
        setTempos(cfg.tempo_idle_home_seg, cfg.tempo_descanso_home_seg);
        setIdleSeconds(cfg.tempo_descanso_home_seg); // vitrine usa esse tempo
        setCarregando(false);
      } catch (error) {
        console.error("Erro ao carregar dados do tablet:", error);
        toast.error("Erro ao carregar dados do tablet");
        setCarregando(false);
      }
    };

    loadTabletData();
  }, [
    tabletIdResolvido,
    setTabletId,
    setMercadinhoAtualId,
    setTabletStoreId,
    setTempos,
    setIdleSeconds,
    setCarregando,
  ]);

  const adminPath = tabletIdResolvido
    ? `/admin?tablet_id=${tabletIdResolvido}`
    : "/admin";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-6 relative">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          Mercadinho Autoatendimento
        </h1>
        <p className="text-xl text-gray-600">
          Escolha uma opção para começar
        </p>
      </div>

      <div className="flex flex-col gap-6 w-full max-w-md">
        <Button
          size="lg"
          className="h-20 text-xl font-semibold bg-blue-600 hover:bg-blue-700"
          onClick={() => navigate(getSelectClientPath())}
        >
          <ShoppingCart className="w-8 h-8 mr-3" />
          Iniciar Compra
        </Button>

        {/* Botão Área do Cliente */}
        <Button
          variant="secondary"
          className="w-full max-w-sm mx-auto h-12 text-base"
          onClick={() => navigate(getAreaClientePath())}
        >
          Área do Cliente
        </Button>
      </div>

      {/* Botão Admin */}
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full opacity-60 hover:opacity-100"
        onClick={() => navigate(adminPath)}
      >
        <Settings className="w-6 h-6" />
      </Button>
    </div>
  );
};

export default Index;

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConfigSistemaStore } from "@/stores/configSistemaStore";

export function useConfigRealtime() {
  const { setConfigSistema, setConfigPagamentos, updateConfigPagamento } =
    useConfigSistemaStore();

  useEffect(() => {
    // Fetch inicial
    const loadInitialData = async () => {
      // config_sistema
      const { data: sistemaData } = await supabase
        .from("config_sistema")
        .select("bip_ativo, bip_volume")
        .eq("id", 1)
        .maybeSingle();

      if (sistemaData) {
        setConfigSistema({
          bip_ativo: sistemaData.bip_ativo,
          bip_volume: sistemaData.bip_volume,
        });
      }

      // config_pagamentos_mensais
      const { data: pagamentosData } = await supabase
        .from("config_pagamentos_mensais")
        .select("mes_referencia, data_limite");

      if (pagamentosData) {
        setConfigPagamentos(
          pagamentosData.map((p) => ({
            mes_referencia: p.mes_referencia,
            data_limite: p.data_limite,
          }))
        );
      }
    };

    loadInitialData();

    // Realtime para config_sistema
    const sistemaChannel = supabase
      .channel("config_sistema_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "config_sistema",
        },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            const newData = payload.new as {
              bip_ativo: boolean;
              bip_volume: number;
            };
            setConfigSistema({
              bip_ativo: newData.bip_ativo,
              bip_volume: newData.bip_volume,
            });
          }
        }
      )
      .subscribe();

    // Realtime para config_pagamentos_mensais
    const pagamentosChannel = supabase
      .channel("config_pagamentos_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "config_pagamentos_mensais",
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            // Reload all on delete
            loadInitialData();
          } else if (payload.new && typeof payload.new === "object") {
            const newData = payload.new as {
              mes_referencia: string;
              data_limite: string | null;
            };
            updateConfigPagamento({
              mes_referencia: newData.mes_referencia,
              data_limite: newData.data_limite,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sistemaChannel);
      supabase.removeChannel(pagamentosChannel);
    };
  }, [setConfigSistema, setConfigPagamentos, updateConfigPagamento]);
}

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConfigNotifStore, ConfigNotif } from "@/stores/configNotifStore";

export function useConfigNotifRealtime() {
  const setConfig = useConfigNotifStore((s) => s.setConfig);

  useEffect(() => {
    const loadInitialData = async () => {
      const { data } = await supabase
        .from("config_sistema")
        .select(`
          notif_venda_popup_ativo,
          notif_venda_som_ativo,
          notif_venda_som_volume,
          notif_venda_som_br,
          notif_venda_som_sf,
          ao_vivo_contador_br_metrica,
          ao_vivo_contador_br_periodo,
          ao_vivo_contador_sf_metrica,
          ao_vivo_contador_sf_periodo
        `)
        .eq("id", 1)
        .maybeSingle();

      if (data) {
        setConfig(data as ConfigNotif);
      }
    };

    loadInitialData();

    const channel = supabase
      .channel("config_notif_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "config_sistema",
        },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            const newData = payload.new as Record<string, any>;
            setConfig({
              notif_venda_popup_ativo: newData.notif_venda_popup_ativo,
              notif_venda_som_ativo: newData.notif_venda_som_ativo,
              notif_venda_som_volume: newData.notif_venda_som_volume,
              notif_venda_som_br: newData.notif_venda_som_br,
              notif_venda_som_sf: newData.notif_venda_som_sf,
              ao_vivo_contador_br_metrica: newData.ao_vivo_contador_br_metrica,
              ao_vivo_contador_br_periodo: newData.ao_vivo_contador_br_periodo,
              ao_vivo_contador_sf_metrica: newData.ao_vivo_contador_sf_metrica,
              ao_vivo_contador_sf_periodo: newData.ao_vivo_contador_sf_periodo,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setConfig]);
}

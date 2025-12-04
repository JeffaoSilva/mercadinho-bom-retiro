import { supabase } from "@/integrations/supabase/client";

export type ConfigInatividade = {
  tempo_idle_home_seg: number;
  tempo_descanso_home_seg: number;
};

// busca config do tablet > senão global > senão default local
export async function buscarConfigInatividade(tabletId?: number | null): Promise<ConfigInatividade> {
  // 1) tenta config específica do tablet
  if (tabletId) {
    const { data: cfgTablet, error: errTablet } = await supabase
      .from("config_inatividade")
      .select("tempo_idle_home_seg, tempo_descanso_home_seg")
      .eq("tablet_id", tabletId)
      .eq("ativo", true)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!errTablet && cfgTablet) return cfgTablet;
  }

  // 2) tenta config global
  const { data: cfgGlobal, error: errGlobal } = await supabase
    .from("config_inatividade")
    .select("tempo_idle_home_seg, tempo_descanso_home_seg")
    .is("tablet_id", null)
    .eq("ativo", true)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!errGlobal && cfgGlobal) return cfgGlobal;

  // 3) fallback local (se banco vazio)
  return {
    tempo_idle_home_seg: 90,
    tempo_descanso_home_seg: 25,
  };
}

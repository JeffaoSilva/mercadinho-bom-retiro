import { create } from "zustand";

export interface ConfigNotif {
  notif_venda_popup_ativo: boolean;
  notif_venda_som_ativo: boolean;
  notif_venda_som_volume: number;
  notif_venda_som_br: string;
  notif_venda_som_sf: string;
  ao_vivo_contador_br_metrica: string;
  ao_vivo_contador_br_periodo: string;
  ao_vivo_contador_sf_metrica: string;
  ao_vivo_contador_sf_periodo: string;
}

interface ConfigNotifState {
  config: ConfigNotif;
  setConfig: (config: Partial<ConfigNotif>) => void;
}

export const useConfigNotifStore = create<ConfigNotifState>((set) => ({
  config: {
    notif_venda_popup_ativo: true,
    notif_venda_som_ativo: true,
    notif_venda_som_volume: 70,
    notif_venda_som_br: 'beep1',
    notif_venda_som_sf: 'beep2',
    ao_vivo_contador_br_metrica: 'qtd',
    ao_vivo_contador_br_periodo: 'dia',
    ao_vivo_contador_sf_metrica: 'qtd',
    ao_vivo_contador_sf_periodo: 'dia',
  },
  setConfig: (newConfig) =>
    set((state) => ({
      config: { ...state.config, ...newConfig },
    })),
}));

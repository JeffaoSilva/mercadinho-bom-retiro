import { create } from "zustand";

interface ConfigInatividadeStore {
  tempo_idle_home_seg: number;
  tempo_descanso_home_seg: number;
  carregando: boolean;
  setCarregando: (valor: boolean) => void;
  setTempos: (idleSeg: number, descansoSeg: number) => void;
}

export const useConfigInatividadeStore = create<ConfigInatividadeStore>((set) => ({
  tempo_idle_home_seg: 90,
  tempo_descanso_home_seg: 25,
  carregando: true,
  setCarregando: (valor) => set({ carregando: valor }),
  setTempos: (idleSeg, descansoSeg) =>
    set({
      tempo_idle_home_seg: idleSeg,
      tempo_descanso_home_seg: descansoSeg,
    }),
}));

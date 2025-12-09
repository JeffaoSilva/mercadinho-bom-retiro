import { create } from "zustand";

interface ConfigSistema {
  bip_ativo: boolean;
  bip_volume: number;
}

interface ConfigPagamentoMensal {
  mes_referencia: string;
  data_limite: string | null;
}

interface ConfigSistemaState {
  configSistema: ConfigSistema;
  configPagamentos: ConfigPagamentoMensal[];
  setConfigSistema: (config: ConfigSistema) => void;
  setConfigPagamentos: (configs: ConfigPagamentoMensal[]) => void;
  updateConfigPagamento: (config: ConfigPagamentoMensal) => void;
}

export const useConfigSistemaStore = create<ConfigSistemaState>((set) => ({
  configSistema: {
    bip_ativo: true,
    bip_volume: 70,
  },
  configPagamentos: [],
  setConfigSistema: (config) => set({ configSistema: config }),
  setConfigPagamentos: (configs) => set({ configPagamentos: configs }),
  updateConfigPagamento: (config) =>
    set((state) => {
      const exists = state.configPagamentos.find(
        (c) => c.mes_referencia === config.mes_referencia
      );
      if (exists) {
        return {
          configPagamentos: state.configPagamentos.map((c) =>
            c.mes_referencia === config.mes_referencia ? config : c
          ),
        };
      }
      return {
        configPagamentos: [...state.configPagamentos, config],
      };
    }),
}));

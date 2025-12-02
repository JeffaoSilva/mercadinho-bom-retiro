import { create } from 'zustand';

interface IdleStore {
  idleSeconds: number;
  setIdleSeconds: (seconds: number) => void;
}

const getInitialIdleSeconds = (): number => {
  const saved = localStorage.getItem('tela_descanso_timeout');
  return saved ? parseInt(saved, 10) : 30;
};

export const useIdleStore = create<IdleStore>((set) => ({
  idleSeconds: getInitialIdleSeconds(),
  setIdleSeconds: (seconds: number) => {
    localStorage.setItem('tela_descanso_timeout', seconds.toString());
    set({ idleSeconds: seconds });
  },
}));

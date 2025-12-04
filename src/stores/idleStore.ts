import { create } from 'zustand';

interface IdleStore {
  idleSeconds: number;
  setIdleSeconds: (seconds: number) => void;
}

export const useIdleStore = create<IdleStore>((set) => ({
  idleSeconds: 25,
  setIdleSeconds: (seconds: number) => set({ idleSeconds: seconds }),
}));

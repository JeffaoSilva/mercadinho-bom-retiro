import { create } from 'zustand';

interface AdminState {
  isAuthenticated: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const ADMIN_PASSWORD = '152637';

export const useAdmin = create<AdminState>((set) => ({
  isAuthenticated: false,
  login: (password: string) => {
    if (password === ADMIN_PASSWORD) {
      set({ isAuthenticated: true });
      return true;
    }
    return false;
  },
  logout: () => set({ isAuthenticated: false }),
}));

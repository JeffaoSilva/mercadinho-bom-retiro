import { create } from 'zustand';

interface TabletStore {
  tabletId: number | null;
  setTabletId: (id: number | null) => void;
}

const getInitialTabletId = (): number | null => {
  const saved = localStorage.getItem('tablet_id');
  return saved ? parseInt(saved, 10) : null;
};

export const useTabletStore = create<TabletStore>((set) => ({
  tabletId: getInitialTabletId(),
  setTabletId: (id: number | null) => {
    if (id !== null) {
      localStorage.setItem('tablet_id', id.toString());
    } else {
      localStorage.removeItem('tablet_id');
    }
    set({ tabletId: id });
  },
}));

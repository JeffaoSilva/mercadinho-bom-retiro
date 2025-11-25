import { create } from 'zustand';

interface CartItem {
  produto_id: number;
  nome: string;
  preco: number;
  quantidade: number;
  codigo_barras: string;
}

interface CheckoutState {
  tabletId: string | null;
  mercadinhoId: number | null;
  clienteId: number | null;
  clienteNome: string | null;
  isVisitante: boolean;
  cart: CartItem[];
  setTabletId: (tabletId: string) => void;
  setTablet: (tabletId: string, mercadinhoId: number) => void;
  setCliente: (clienteId: number, nome: string) => void;
  setVisitante: () => void;
  addToCart: (item: Omit<CartItem, 'quantidade'>) => void;
  removeFromCart: (produto_id: number) => void;
  updateQuantity: (produto_id: number, quantidade: number) => void;
  getTotal: () => number;
  reset: () => void;
}

export const useCheckout = create<CheckoutState>((set, get) => ({
  tabletId: null,
  mercadinhoId: null,
  clienteId: null,
  clienteNome: null,
  isVisitante: false,
  cart: [],
  setTabletId: (tabletId) => set({ tabletId }),
  setTablet: (tabletId, mercadinhoId) => set({ tabletId, mercadinhoId }),
  setCliente: (clienteId, nome) => set({ clienteId, clienteNome: nome, isVisitante: false }),
  setVisitante: () => set({ isVisitante: true, clienteId: null, clienteNome: 'VISITANTE' }),
  addToCart: (item) => set((state) => {
    const existing = state.cart.find(i => i.produto_id === item.produto_id);
    if (existing) {
      return {
        cart: state.cart.map(i =>
          i.produto_id === item.produto_id
            ? { ...i, quantidade: i.quantidade + 1 }
            : i
        )
      };
    }
    return { cart: [...state.cart, { ...item, quantidade: 1 }] };
  }),
  removeFromCart: (produto_id) => set((state) => ({
    cart: state.cart.filter(i => i.produto_id !== produto_id)
  })),
  updateQuantity: (produto_id, quantidade) => set((state) => ({
    cart: state.cart.map(i =>
      i.produto_id === produto_id ? { ...i, quantidade } : i
    ).filter(i => i.quantidade > 0)
  })),
  getTotal: () => {
    const state = get();
    return state.cart.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
  },
  reset: () => set({
    tabletId: null,
    mercadinhoId: null,
    clienteId: null,
    clienteNome: null,
    isVisitante: false,
    cart: []
  })
}));

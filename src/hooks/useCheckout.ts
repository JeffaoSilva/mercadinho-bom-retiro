import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  produto_id: number;
  nome: string;
  preco: number;
  preco_original?: number;
  quantidade: number;
  codigo_barras: string;
  prateleira_id?: number; // ID da prateleira de onde veio
}

interface CheckoutState {
  tabletId: string | null;
  mercadinhoAtualId: number | null;
  clienteId: number | null;
  clienteNome: string | null;
  isVisitante: boolean;
  cart: CartItem[];

  setTabletId: (tabletId: string) => void;
  setMercadinhoAtualId: (mercadinhoId: number) => void;
  setCliente: (clienteId: number, nome: string) => void;
  setVisitante: () => void;

  addToCart: (item: Omit<CartItem, "quantidade">) => void;
  addToCartWithPrice: (item: Omit<CartItem, "quantidade">) => void;
  removeFromCart: (produto_id: number, preco?: number) => void;
  updateQuantity: (produto_id: number, quantidade: number, preco?: number) => void;

  getTotal: () => number;
  reset: () => void;

  getHomePath: () => string;
  getSelectClientPath: () => string;
  getAreaClientePath: () => string;

  getCartKey: (produto_id: number, preco: number) => string;
}

export const useCheckout = create<CheckoutState>()(
  persist(
    (set, get) => ({
      tabletId: null,
      mercadinhoAtualId: null,
      clienteId: null,
      clienteNome: null,
      isVisitante: false,
      cart: [],

      setTabletId: (tabletId) => set({ tabletId }),
      setMercadinhoAtualId: (mercadinhoId) =>
        set({ mercadinhoAtualId: mercadinhoId }),
      setCliente: (clienteId, nome) =>
        set({ clienteId, clienteNome: nome, isVisitante: false }),
      setVisitante: () =>
        set({ isVisitante: true, clienteId: null, clienteNome: "VISITANTE" }),

      getCartKey: (produto_id: number, preco: number) =>
        `${produto_id}_${preco.toFixed(2)}`,

      getHomePath: () => {
        const { tabletId } = get();
        return tabletId ? `/?tablet_id=${tabletId}` : `/`;
      },

      getSelectClientPath: () => {
        const { tabletId } = get();
        return tabletId
          ? `/select-client?tablet_id=${tabletId}`
          : `/select-client`;
      },

      getAreaClientePath: () => {
        const { tabletId } = get();
        return tabletId
          ? `/area-cliente?tablet_id=${tabletId}`
          : `/area-cliente`;
      },

      addToCart: (item) =>
        set((state) => {
          const existing = state.cart.find(
            (i) => i.produto_id === item.produto_id && i.preco === item.preco
          );
          if (existing) {
            return {
              cart: state.cart.map((i) =>
                i.produto_id === item.produto_id && i.preco === item.preco
                  ? { ...i, quantidade: i.quantidade + 1 }
                  : i
              ),
            };
          }
          return { cart: [...state.cart, { ...item, quantidade: 1 }] };
        }),

      addToCartWithPrice: (item) =>
        set((state) => {
          const existing = state.cart.find(
            (i) => i.produto_id === item.produto_id && i.preco === item.preco
          );
          if (existing) {
            return {
              cart: state.cart.map((i) =>
                i.produto_id === item.produto_id && i.preco === item.preco
                  ? { ...i, quantidade: i.quantidade + 1 }
                  : i
              ),
            };
          }
          return { cart: [...state.cart, { ...item, quantidade: 1 }] };
        }),

      removeFromCart: (produto_id, preco) =>
        set((state) => ({
          cart: state.cart.filter((i) => {
            if (preco !== undefined) {
              return !(i.produto_id === produto_id && i.preco === preco);
            }
            return i.produto_id !== produto_id;
          }),
        })),

      updateQuantity: (produto_id, quantidade, preco) =>
        set((state) => ({
          cart: state.cart
            .map((i) => {
              if (preco !== undefined) {
                return i.produto_id === produto_id && i.preco === preco
                  ? { ...i, quantidade }
                  : i;
              }
              return i.produto_id === produto_id
                ? { ...i, quantidade }
                : i;
            })
            .filter((i) => i.quantidade > 0),
        })),

      getTotal: () => {
        const state = get();
        return state.cart.reduce(
          (sum, item) => sum + item.preco * item.quantidade,
          0
        );
      },

      reset: () =>
        set({
          clienteId: null,
          clienteNome: null,
          isVisitante: false,
          cart: [],
        }),
    }),
    {
      name: "mercadinho-checkout", // chave no localStorage
      // ✅ persistimos só o que interessa pro tablet ser definitivo
      partialize: (state) => ({
        tabletId: state.tabletId,
        mercadinhoAtualId: state.mercadinhoAtualId,
      }),
    }
  )
);

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import Index from "./pages/Index";
import SelectClient from "./pages/SelectClient";
import Pin from "./pages/Pin";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import AdminProdutos from "./pages/admin/AdminProdutos";
import AdminEstoque from "./pages/admin/AdminEstoque";
import AdminPromocoes from "./pages/admin/AdminPromocoes";
import AdminCompras from "./pages/admin/AdminCompras";
import AdminClientes from "./pages/admin/AdminClientes";
import AdminTelaDescanso from "./pages/admin/AdminTelaDescanso";
import AdminPrateleirasEstoque from "./pages/admin/AdminPrateleirasEstoque";
import AdminConfiguracoes from "./pages/admin/AdminConfiguracoes";
import AdminCadernetas from "./pages/admin/AdminCadernetas";
import AdminCodigosTres from "./pages/admin/AdminCodigosTres";
import { TelaDescanso } from "./components/TelaDescanso";
import { useIdleTimer } from "./hooks/useIdleTimer";
import { useConfigInatividadeStore } from "./stores/configInatividadeStore";
import { useCheckout } from "./hooks/useCheckout";

import AreaClienteSelect from "@/pages/AreaClienteSelect";
import AreaCliente from "@/pages/AreaCliente";
import { useConfigRealtime } from "@/hooks/useConfigRealtime";

const queryClient = new QueryClient();

const AppContent = () => {
  // Inicializa store de config globalmente (beep, pagamentos)
  useConfigRealtime();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdminRoute = location.pathname.startsWith("/admin");
  const tempoIdleGeral = useConfigInatividadeStore(s => s.tempo_idle_home_seg);

  const resetCheckout = useCheckout(s => s.reset);
  const getHomePath = useCheckout(s => s.getHomePath);
  const setTabletId = useCheckout(s => s.setTabletId);
  const setMercadinhoAtualId = useCheckout(s => s.setMercadinhoAtualId);

  // ✅ NOVO: toda vez que a URL tiver tablet_id, salva no store
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const t = sp.get("tablet_id");

    if (t) {
      setTabletId(t);

      // como hoje teu sistema usa:
      // tablet_id=1 -> mercadinho BR (id 1)
      // tablet_id=2 -> mercadinho SF (id 2)
      if (t === "1") setMercadinhoAtualId(1);
      if (t === "2") setMercadinhoAtualId(2);
    }
  }, [location.search, setTabletId, setMercadinhoAtualId]);

  useIdleTimer({
    timeoutSeconds: tempoIdleGeral,
    enabled: !isAdminRoute && tempoIdleGeral > 0,
    onIdle: () => {
      console.log('[App] Idle global - limpando carrinho e voltando para home');
      resetCheckout();
      // ✅ Voltar pra home preservando tablet_id
      navigate(getHomePath());
    }
  });

  return (
    <>
      <TelaDescanso />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/select-client" element={<SelectClient />} />
        <Route path="/pin" element={<Pin />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />

        <Route path="/area-cliente" element={<AreaClienteSelect />} />
        <Route path="/area-cliente/:clienteId" element={<AreaCliente />} />

        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/produtos" element={<AdminProdutos />} />
        <Route path="/admin/prateleiras-estoque" element={<AdminPrateleirasEstoque />} />
        <Route path="/admin/estoque" element={<AdminEstoque />} />
        <Route path="/admin/promocoes" element={<AdminPromocoes />} />
        <Route path="/admin/compras" element={<AdminCompras />} />
        <Route path="/admin/clientes" element={<AdminClientes />} />
        <Route path="/admin/tela-descanso" element={<AdminTelaDescanso />} />
        <Route path="/admin/configuracoes" element={<AdminConfiguracoes />} />
        <Route path="/admin/cadernetas" element={<AdminCadernetas />} />
        <Route path="/admin/codigos-tres" element={<AdminCodigosTres />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

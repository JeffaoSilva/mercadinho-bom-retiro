import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
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
import AdminEstornos from "./pages/admin/AdminEstornos";
import AdminTelaDescanso from "./pages/admin/AdminTelaDescanso";
import AdminEntradaEstoque from "./pages/admin/AdminEntradaEstoque";
import { TelaDescanso } from "./components/TelaDescanso";
import { useIdleTimer } from "./hooks/useIdleTimer";
import { useConfigInatividadeStore } from "./stores/configInatividadeStore";
import { useCheckout } from "./hooks/useCheckout";

const queryClient = new QueryClient();

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const tempoIdleGeral = useConfigInatividadeStore(s => s.tempo_idle_home_seg);
  const resetCheckout = useCheckout(s => s.reset);

  useIdleTimer({
    timeoutSeconds: tempoIdleGeral,
    enabled: !isAdminRoute && tempoIdleGeral > 0,
    onIdle: () => {
      console.log('[App] Idle global - limpando carrinho e voltando para home');
      // Limpar compra atual
      resetCheckout();
      // Voltar para home
      navigate("/");
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
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/produtos" element={<AdminProdutos />} />
        <Route path="/admin/entrada-estoque" element={<AdminEntradaEstoque />} />
        <Route path="/admin/estoque" element={<AdminEstoque />} />
        <Route path="/admin/promocoes" element={<AdminPromocoes />} />
        <Route path="/admin/compras" element={<AdminCompras />} />
        <Route path="/admin/clientes" element={<AdminClientes />} />
        <Route path="/admin/estornos" element={<AdminEstornos />} />
        <Route path="/admin/tela-descanso" element={<AdminTelaDescanso />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => (
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

export default App;

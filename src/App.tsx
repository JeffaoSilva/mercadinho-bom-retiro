import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/select-client" element={<SelectClient />} />
          <Route path="/pin" element={<Pin />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/produtos" element={<AdminProdutos />} />
          <Route path="/admin/estoque" element={<AdminEstoque />} />
          <Route path="/admin/promocoes" element={<AdminPromocoes />} />
          <Route path="/admin/compras" element={<AdminCompras />} />
          <Route path="/admin/clientes" element={<AdminClientes />} />
          <Route path="/admin/estornos" element={<AdminEstornos />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

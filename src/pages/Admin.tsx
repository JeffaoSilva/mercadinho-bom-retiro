import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { toast } from "sonner";
import {
  Package,
  Boxes,
  Tag,
  ShoppingBag,
  Users,
  LogOut,
  ArrowLeft,
  Loader2,
  LayoutGrid,
  Settings,
  BookOpen,
  Key,
} from "lucide-react";
import AlertaEstoqueBaixo from "@/components/admin/AlertaEstoqueBaixo";

const Admin = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading, signIn, signOut } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error("Preencha email e senha");
      return;
    }
    
    setIsLoggingIn(true);
    const { error } = await signIn(email, password);
    setIsLoggingIn(false);
    
    if (error) {
      toast.error("Credenciais inválidas");
      setPassword("");
    } else {
      toast.success("Acesso liberado");
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold">Área Administrativa</h1>
            <p className="text-muted-foreground mt-2">Faça login para acessar</p>
          </div>
          
          <div className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 text-xl"
              autoFocus
            />
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="h-14 text-xl"
            />
            <Button 
              onClick={handleLogin} 
              className="w-full h-14 text-xl"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              Entrar
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="w-full h-12"
            >
              <ArrowLeft className="mr-2 h-5 w-5" />
              Voltar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const menuItems = [
    { title: "Produtos", icon: Package, route: "/admin/produtos" },
    { title: "Prateleiras / Estoque", icon: LayoutGrid, route: "/admin/prateleiras-estoque" },
    { title: "Lotes", icon: Boxes, route: "/admin/estoque" },
    { title: "Promoções", icon: Tag, route: "/admin/promocoes" },
    { title: "Cadernetas", icon: BookOpen, route: "/admin/cadernetas" },
    { title: "Compras", icon: ShoppingBag, route: "/admin/compras" },
    { title: "Clientes", icon: Users, route: "/admin/clientes" },
    { title: "Códigos Três", icon: Key, route: "/admin/codigos-tres" },
    { title: "Configurações", icon: Settings, route: "/admin/configuracoes" },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Painel Administrativo</h1>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-5 w-5" />
            Sair
          </Button>
        </div>

        <AlertaEstoqueBaixo />

        <div className="grid grid-cols-2 gap-4">
          {menuItems.map((item) => (
            <Button
              key={item.route}
              variant="outline"
              className="h-32 flex flex-col gap-3 text-xl"
              onClick={() => navigate(item.route)}
            >
              <item.icon className="h-10 w-10" />
              {item.title}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Admin;

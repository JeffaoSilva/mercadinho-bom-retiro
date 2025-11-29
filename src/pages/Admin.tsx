import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdmin } from "@/hooks/useAdmin";
import { toast } from "sonner";
import {
  Package,
  Boxes,
  Tag,
  ShoppingBag,
  Users,
  RotateCcw,
  LogOut,
  ArrowLeft,
} from "lucide-react";

const Admin = () => {
  const navigate = useNavigate();
  const { isAuthenticated, login, logout } = useAdmin();
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    if (login(password)) {
      toast.success("Acesso liberado");
    } else {
      toast.error("Senha incorreta");
      setPassword("");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold">Área Administrativa</h1>
            <p className="text-muted-foreground mt-2">Digite a senha para acessar</p>
          </div>
          
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Senha de administrador"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="h-14 text-xl text-center"
              autoFocus
            />
            <Button onClick={handleLogin} className="w-full h-14 text-xl">
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
    { title: "Estoque / Lotes", icon: Boxes, route: "/admin/estoque" },
    { title: "Promoções", icon: Tag, route: "/admin/promocoes" },
    { title: "Compras / Cadernetas", icon: ShoppingBag, route: "/admin/compras" },
    { title: "Clientes", icon: Users, route: "/admin/clientes" },
    { title: "Estornos", icon: RotateCcw, route: "/admin/estornos" },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Painel Administrativo</h1>
          <Button variant="outline" onClick={() => { logout(); navigate("/"); }}>
            <LogOut className="mr-2 h-5 w-5" />
            Sair
          </Button>
        </div>

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

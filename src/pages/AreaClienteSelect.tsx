import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCheckout } from "@/hooks/useCheckout";

type ClienteKiosk = {
  id: number;
  nome: string;
  mercadinho_id: number | null;
};

export default function AreaClienteSelect() {
  const navigate = useNavigate();
  const { mercadinhoAtualId, setCliente } = useCheckout();

  const [clientes, setClientes] = useState<ClienteKiosk[]>([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    const carregar = async () => {
      let query = supabase
        .from("clientes_kiosk")
        .select("id, nome, mercadinho_id")
        .order("nome");

      // Se já soubermos o mercadinho do tablet, filtra por ele
      if (mercadinhoAtualId) {
        query = query.eq("mercadinho_id", mercadinhoAtualId);
      }

      const { data, error } = await query;

      if (!error && data) {
        setClientes(data as ClienteKiosk[]);
      } else {
        console.error("Erro carregando clientes_kiosk", error);
        setClientes([]);
      }
    };

    carregar();
  }, [mercadinhoAtualId]);

  const clientesFiltrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return clientes;
    return clientes.filter((c) => c.nome.toLowerCase().includes(b));
  }, [clientes, busca]);

  const escolherCliente = (c: ClienteKiosk) => {
    // ✅ SETA o cliente no store (pra Área do Cliente e Carrinho saberem quem é)
    setCliente(c.id, c.nome);

    // Navega para o PIN, mas dizendo que o destino é a Área do Cliente
    navigate("/pin", {
      state: {
        clienteId: c.id,
        clienteNome: c.nome,
        destino: "areaCliente",
      },
    });
  };

  return (
    <div className="min-h-screen p-4 flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Área do Cliente</h1>
        <p className="text-muted-foreground">
          Selecione seu nome para ver seu histórico e fatura.
        </p>

        <Input
          placeholder="Buscar cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </header>

      <div className="grid grid-cols-2 gap-3">
        {clientesFiltrados.map((c) => (
          <Button
            key={c.id}
            variant="secondary"
            className="h-16 text-lg justify-center"
            onClick={() => escolherCliente(c)}
          >
            {c.nome}
          </Button>
        ))}
      </div>

      {clientesFiltrados.length === 0 && (
        <div className="text-center text-muted-foreground mt-6">
          Nenhum cliente encontrado.
        </div>
      )}

      <div className="mt-auto">
        <Button
          variant="outline"
          className="w-full h-12"
          onClick={() => navigate("/")}
        >
          Voltar
        </Button>
      </div>
    </div>
  );
}

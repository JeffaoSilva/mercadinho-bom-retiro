import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";

interface PrateleiraBaixa {
  id: number;
  produto_nome: string;
  preco_venda_prateleira: number;
  quantidade_prateleira: number;
  mercadinho_nome: string;
  mercadinho_id: number;
}

const AlertaEstoqueBaixo = () => {
  const [itens, setItens] = useState<PrateleiraBaixa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEstoqueBaixo();
  }, []);

  const loadEstoqueBaixo = async () => {
    const { data, error } = await supabase
      .from("prateleiras_produtos")
      .select(`
        id,
        preco_venda_prateleira,
        quantidade_prateleira,
        mercadinho_id,
        mercadinhos (nome),
        produtos (nome)
      `)
      .eq("ativo", true)
      .lte("quantidade_prateleira", 2)
      .gt("quantidade_prateleira", 0)
      .order("quantidade_prateleira", { ascending: true });

    setLoading(false);

    if (error) {
      console.error("Erro ao buscar estoque baixo:", error);
      return;
    }

    const formatted: PrateleiraBaixa[] = (data || []).map((item: any) => ({
      id: item.id,
      produto_nome: item.produtos?.nome || "Produto",
      preco_venda_prateleira: item.preco_venda_prateleira,
      quantidade_prateleira: item.quantidade_prateleira,
      mercadinho_nome: item.mercadinhos?.nome || "Mercadinho",
      mercadinho_id: item.mercadinho_id,
    }));

    setItens(formatted);
  };

  if (loading) return null;
  if (itens.length === 0) return null;

  // Agrupar por mercadinho
  const porMercadinho = itens.reduce((acc, item) => {
    if (!acc[item.mercadinho_nome]) {
      acc[item.mercadinho_nome] = [];
    }
    acc[item.mercadinho_nome].push(item);
    return acc;
  }, {} as Record<string, PrateleiraBaixa[]>);

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2 text-amber-700">
        <AlertTriangle className="w-5 h-5" />
        <h3 className="font-semibold">Produtos Acabando</h3>
      </div>

      {Object.entries(porMercadinho).map(([mercadinho, produtos]) => (
        <div key={mercadinho} className="space-y-2">
          <p className="text-sm font-medium text-amber-800">Acabando no {mercadinho}:</p>
          <div className="space-y-1">
            {produtos.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-sm bg-background/50 rounded px-3 py-2"
              >
                <span className="font-medium">{item.produto_nome}</span>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    R$ {item.preco_venda_prateleira.toFixed(2)}
                  </span>
                  <span
                    className={`font-bold ${
                      item.quantidade_prateleira <= 1
                        ? "text-destructive"
                        : "text-amber-600"
                    }`}
                  >
                    {item.quantidade_prateleira} un
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AlertaEstoqueBaixo;

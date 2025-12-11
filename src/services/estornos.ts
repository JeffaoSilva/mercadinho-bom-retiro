import { supabase } from "@/integrations/supabase/client";

interface ItemCompraEstorno {
  id: number;
  produto_id: number;
  quantidade: number;
  valor_total: number;
  produto?: { nome: string; quantidade_atual: number };
}

/**
 * Estorna uma compra completa:
 * 1. Reverte estoque de cada item (quantidade_atual)
 * 2. Deleta todos os itens da compra
 * 3. Deleta a compra
 */
export async function estornarCompraCompleta(
  compraId: number,
  itens: ItemCompraEstorno[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Reverter estoque de cada item
    for (const item of itens) {
      if (item.produto) {
        const { error } = await supabase
          .from("produtos")
          .update({
            quantidade_atual: item.produto.quantidade_atual + item.quantidade,
          })
          .eq("id", item.produto_id);

        if (error) {
          console.error("Erro ao reverter estoque:", error);
          return { ok: false, error: "Erro ao reverter estoque" };
        }
      }
    }

    // Deletar itens
    const { error: itensError } = await supabase
      .from("itens_compra")
      .delete()
      .eq("compra_id", compraId);

    if (itensError) {
      console.error("Erro ao deletar itens:", itensError);
      return { ok: false, error: "Erro ao deletar itens" };
    }

    // Deletar compra
    const { error: compraError } = await supabase
      .from("compras")
      .delete()
      .eq("id", compraId);

    if (compraError) {
      console.error("Erro ao deletar compra:", compraError);
      return { ok: false, error: "Erro ao deletar compra" };
    }

    return { ok: true };
  } catch (err) {
    console.error("Erro no estorno:", err);
    return { ok: false, error: "Erro inesperado" };
  }
}

import { supabase } from "@/integrations/supabase/client";

interface EstornoCompraResult {
  ok: boolean;
  itens_estornados?: number;
  compra_removida?: boolean;
  erro?: string;
}

/**
 * Estorna uma compra completa via RPC:
 * - Estorna todos os itens automaticamente para sua prateleira de origem
 * - Remove a compra
 */
export async function estornarCompraCompleta(
  compraId: number,
  devolverEstoque: boolean = true,
  motivo?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("admin_estornar_compra" as any, {
      p_compra_id: compraId,
      p_devolver_estoque: devolverEstoque,
      p_motivo: motivo ?? null,
    });

    if (error) {
      console.error("Erro ao estornar compra:", error);
      return { ok: false, error: "Erro ao estornar compra" };
    }

    const result = data as EstornoCompraResult;
    
    if (!result.ok) {
      return { ok: false, error: result.erro || "Erro desconhecido" };
    }

    return { ok: true };
  } catch (err) {
    console.error("Erro no estorno:", err);
    return { ok: false, error: "Erro inesperado" };
  }
}

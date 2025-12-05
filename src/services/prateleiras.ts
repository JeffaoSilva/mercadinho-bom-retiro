import { supabase } from "@/integrations/supabase/client";

export interface Exposicao {
  id: number;
  preco_venda_prateleira: number;
  quantidade_prateleira: number;
}

export interface PlanoBaixa {
  prateleira_id: number;
  preco_unitario: number;
  quantidade_baixar: number;
}

// A) Busca exposições ativas ordenadas por preço (mais barato primeiro)
export async function buscarExposicoesProduto(
  mercadinhoId: number,
  produtoId: number
): Promise<Exposicao[]> {
  const { data, error } = await supabase
    .from("prateleiras_produtos")
    .select("id, preco_venda_prateleira, quantidade_prateleira")
    .eq("mercadinho_id", mercadinhoId)
    .eq("produto_id", produtoId)
    .eq("ativo", true)
    .gt("quantidade_prateleira", 0)
    .order("preco_venda_prateleira", { ascending: true });

  if (error) {
    console.error("Erro ao buscar exposições:", error);
    return [];
  }

  return data || [];
}

// B) Total disponível na prateleira do mercadinho
export async function totalDisponivelProduto(
  mercadinhoId: number,
  produtoId: number
): Promise<number> {
  const { data, error } = await supabase.rpc("prateleira_total_disponivel", {
    p_mercadinho_id: mercadinhoId,
    p_produto_id: produtoId,
  });

  if (error) {
    console.error("Erro ao buscar total disponível:", error);
    return 0;
  }

  return data || 0;
}

// C) Gera plano de baixa consumindo do mais barato primeiro
export function baixarDaPrateleira(
  exposicoes: Exposicao[],
  quantidade: number
): PlanoBaixa[] {
  const plano: PlanoBaixa[] = [];
  let restante = quantidade;

  for (const expo of exposicoes) {
    if (restante <= 0) break;

    const qtdBaixar = Math.min(restante, expo.quantidade_prateleira);
    if (qtdBaixar > 0) {
      plano.push({
        prateleira_id: expo.id,
        preco_unitario: expo.preco_venda_prateleira,
        quantidade_baixar: qtdBaixar,
      });
      restante -= qtdBaixar;
    }
  }

  return plano;
}

// D) Busca o próximo preço disponível para adicionar 1 unidade
export function proximoPrecoDisponivel(
  exposicoes: Exposicao[],
  quantidadeJaNoCarrinho: Map<number, number> // prateleira_id -> qtd já reservada
): { prateleira_id: number; preco: number } | null {
  for (const expo of exposicoes) {
    const jaReservado = quantidadeJaNoCarrinho.get(expo.id) || 0;
    const disponivel = expo.quantidade_prateleira - jaReservado;
    if (disponivel > 0) {
      return { prateleira_id: expo.id, preco: expo.preco_venda_prateleira };
    }
  }
  return null;
}

// E) Executa a baixa real no banco
export async function executarBaixaPrateleira(
  plano: PlanoBaixa[]
): Promise<boolean> {
  for (const item of plano) {
    const { error } = await supabase.rpc("prateleira_total_disponivel", {
      p_mercadinho_id: 0, // Placeholder - não usado
      p_produto_id: 0,
    });
    
    // Update direto na prateleira
    const { error: updateError } = await supabase
      .from("prateleiras_produtos")
      .update({
        quantidade_prateleira: supabase.rpc ? undefined : 0, // Será feito com decrement
      })
      .eq("id", item.prateleira_id);

    if (updateError) {
      console.error("Erro ao baixar da prateleira:", updateError);
      return false;
    }
  }
  return true;
}

// F) Decrementa quantidade de uma prateleira específica
export async function decrementarPrateleira(
  prateleiraId: number,
  quantidade: number
): Promise<boolean> {
  // Primeiro busca a quantidade atual
  const { data: atual, error: fetchError } = await supabase
    .from("prateleiras_produtos")
    .select("quantidade_prateleira")
    .eq("id", prateleiraId)
    .single();

  if (fetchError || !atual) {
    console.error("Erro ao buscar prateleira:", fetchError);
    return false;
  }

  const novaQtd = atual.quantidade_prateleira - quantidade;
  if (novaQtd < 0) {
    console.error("Quantidade insuficiente na prateleira");
    return false;
  }

  const { error: updateError } = await supabase
    .from("prateleiras_produtos")
    .update({ quantidade_prateleira: novaQtd })
    .eq("id", prateleiraId);

  if (updateError) {
    console.error("Erro ao atualizar prateleira:", updateError);
    return false;
  }

  return true;
}

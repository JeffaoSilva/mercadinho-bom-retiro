import { supabase } from "@/integrations/supabase/client";

export interface CodigoTres {
  id: number;
  codigo: string;
  usado: boolean;
  criado_em: string;
  usado_em: string | null;
}

export async function listarCodigosTres(): Promise<CodigoTres[]> {
  const { data, error } = await supabase
    .from("codigos_tres" as any)
    .select("*")
    .order("criado_em", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as CodigoTres[];
}

export async function adicionarCodigoTres(codigo: string): Promise<CodigoTres> {
  const { data, error } = await supabase
    .from("codigos_tres" as any)
    .insert({ codigo: codigo.trim().toUpperCase(), usado: false })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as CodigoTres;
}

export async function marcarCodigoUsado(id: number): Promise<void> {
  const { error } = await supabase
    .from("codigos_tres" as any)
    .update({ usado: true, usado_em: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export async function removerCodigoTres(id: number): Promise<void> {
  const { error } = await supabase
    .from("codigos_tres" as any)
    .delete()
    .eq("id", id);

  if (error) throw error;
}

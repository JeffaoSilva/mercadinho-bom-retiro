import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCheckout } from "@/hooks/useCheckout";

type ItemHistorico = {
  produto_id: number;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
};

type CompraHistorico = {
  compra_id: number;
  criado_em: string;
  mercadinho_id: number;
  forma_pagamento: string;
  valor_total: number;
  itens: ItemHistorico[];
};

export default function AreaCliente() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ clienteId: string }>();
  const checkout = useCheckout();

  // tenta pegar do store (quando veio do carrinho) ou da rota
  const clienteIdStore = checkout?.clienteId;
  const clienteNomeStore = checkout?.clienteNome;
  const clienteIdRota = params.clienteId ? Number(params.clienteId) : null;

  const clienteId = clienteIdStore || clienteIdRota;

  const [clienteNome, setClienteNome] = useState<string>(clienteNomeStore || "");
  const [corteAtual, setCorteAtual] = useState<string | null>(null);
  const [compras, setCompras] = useState<CompraHistorico[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (!clienteId) {
        navigate("/area-cliente");
        return;
      }

      setCarregando(true);

      // 1) pega corte atual global
      const { data: corte, error: errCorte } = await supabase
        .from("config_cobranca")
        .select("corte_atual")
        .eq("id", 1)
        .maybeSingle();
      if (errCorte) {
        console.error("Erro get_corte_atual", errCorte);
      } else {
        setCorteAtual(corte?.corte_atual ?? null);
      }

      // 2) pega histórico via RPC segura
      const { data: historicoData, error: errHistorico } = await supabase.rpc(
        "cliente_historico",
        { p_cliente_id: clienteId }
      );

      if (errHistorico) {
        console.error("Erro buscando histórico", errHistorico);
        setCompras([]);
      } else {
        // RPC retorna: compra_id, criado_em, mercadinho_id, forma_pagamento, valor_total, itens (jsonb)
        const lista: CompraHistorico[] = (historicoData ?? []).map((row: any) => ({
          compra_id: row.compra_id,
          criado_em: row.criado_em,
          mercadinho_id: row.mercadinho_id,
          forma_pagamento: row.forma_pagamento,
          valor_total: Number(row.valor_total || 0),
          itens: (row.itens ?? []) as ItemHistorico[],
        }));
        setCompras(lista);
      }

      // 3) se não tiver nome no store, busca no kiosk pra mostrar
      if (!clienteNomeStore) {
        const { data: cdata } = await supabase
          .from("clientes_kiosk")
          .select("nome")
          .eq("id", clienteId)
          .maybeSingle();

        if (cdata?.nome) setClienteNome(cdata.nome);
      }

      setCarregando(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  // A RPC já retorna ordenado por criado_em desc
  const comprasAgrupadas = compras;

  const [loteAtual, loteSeguinte] = useMemo(() => {
    if (!corteAtual) return [comprasAgrupadas, []];

    const corteTime = new Date(corteAtual).getTime();

    const atual: CompraHistorico[] = [];
    const seguinte: CompraHistorico[] = [];

    for (const c of comprasAgrupadas) {
      const t = new Date(c.criado_em).getTime();
      if (t <= corteTime) atual.push(c);
      else seguinte.push(c);
    }

    return [atual, seguinte];
  }, [comprasAgrupadas, corteAtual]);

  const formatarDataHora = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("pt-BR");
    } catch {
      return iso;
    }
  };

  const totalLote = (lote: CompraHistorico[]) =>
    lote.reduce((sum, c) => sum + Number(c.valor_total || 0), 0);

  return (
    <div className="min-h-screen p-4 flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Área do Cliente</h1>

        <div className="flex items-center justify-between gap-2">
          <div className="text-lg font-semibold">
            {clienteNome || "Cliente"}
          </div>

          <Button
            variant="secondary"
            onClick={() => navigate("/cart")}
            disabled={!checkout?.clienteId} // só habilita se já estiver autenticado no store
          >
            Ir pro Carrinho
          </Button>
        </div>

        {corteAtual && (
          <p className="text-sm text-muted-foreground">
            Corte atual: {formatarDataHora(corteAtual)}
          </p>
        )}
      </header>

      {carregando && (
        <div className="text-center text-muted-foreground mt-6">
          Carregando histórico...
        </div>
      )}

      {!carregando && comprasAgrupadas.length === 0 && (
        <div className="text-center text-muted-foreground mt-6">
          Nenhuma compra em aberto.
        </div>
      )}

      {!carregando && comprasAgrupadas.length > 0 && (
        <div className="flex flex-col gap-6">

          {/* LOTE ATUAL */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">
                Fatura atual (até o corte)
              </h2>
              <div className="text-sm font-semibold">
                Total: R$ {totalLote(loteAtual).toFixed(2)}
              </div>
            </div>

            {loteAtual.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Nenhuma compra neste lote.
              </div>
            )}

            {loteAtual.map((compra) => (
              <Card key={compra.compra_id} className="rounded-2xl">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">
                      {formatarDataHora(compra.criado_em)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {compra.forma_pagamento}
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-1">
                    {compra.itens.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <div>
                          {it.nome} x{it.quantidade}
                        </div>
                        <div>
                          R$ {Number(it.valor_total).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between font-semibold">
                    <div>Total da compra</div>
                    <div>R$ {Number(compra.valor_total).toFixed(2)}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>

          {/* LOTE SEGUINTE */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">
                Fatura seguinte (após o corte)
              </h2>
              <div className="text-sm font-semibold">
                Total: R$ {totalLote(loteSeguinte).toFixed(2)}
              </div>
            </div>

            {loteSeguinte.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Nenhuma compra neste lote.
              </div>
            )}

            {loteSeguinte.map((compra) => (
              <Card key={compra.compra_id} className="rounded-2xl">
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">
                      {formatarDataHora(compra.criado_em)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {compra.forma_pagamento}
                    </div>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-1">
                    {compra.itens.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <div>
                          {it.nome} x{it.quantidade}
                        </div>
                        <div>
                          R$ {Number(it.valor_total).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between font-semibold">
                    <div>Total da compra</div>
                    <div>R$ {Number(compra.valor_total).toFixed(2)}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>

        </div>
      )}

      <div className="mt-auto">
        <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
          Voltar pra Home
        </Button>
      </div>
    </div>
  );
}

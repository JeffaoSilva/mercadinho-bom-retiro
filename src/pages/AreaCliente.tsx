import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCheckout } from "@/hooks/useCheckout";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  mes_referencia?: string;
  itens: ItemHistorico[];
};

type HistoricoPayload = {
  mes_atual: string;
  mes_anterior: string;
  dia_limite: number;
  compras_mes_atual: CompraHistorico[];
  compras_mes_anterior: CompraHistorico[];
  compras_atrasadas: CompraHistorico[];
};

export default function AreaCliente() {
  const navigate = useNavigate();
  const params = useParams<{ clienteId: string }>();
  const checkout = useCheckout();

  const clienteIdStore = checkout.clienteId;
  const clienteNomeStore = checkout.clienteNome;
  const clienteIdRota = params.clienteId ? Number(params.clienteId) : null;
  const clienteId = clienteIdStore || clienteIdRota;

  const [clienteNome, setClienteNome] = useState<string>(clienteNomeStore || "");
  const [historico, setHistorico] = useState<HistoricoPayload | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [showMesAnterior, setShowMesAnterior] = useState(false);
  const [showAtrasadas, setShowAtrasadas] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!clienteId) {
        navigate("/area-cliente");
        return;
      }

      setCarregando(true);

      try {
        // Buscar histórico via RPC segura que retorna JSONB estruturado
        const { data: historicoData, error: errHistorico } = await supabase.rpc(
          "cliente_historico",
          { p_cliente_id: clienteId }
        );

        if (errHistorico) {
          console.error("Erro buscando histórico", errHistorico);
          setHistorico(null);
        } else {
          const payload = historicoData as HistoricoPayload;
          setHistorico(payload);
        }

        // Se não tiver nome no store, busca no kiosk pra mostrar
        if (!clienteNomeStore) {
          const { data: cdata } = await supabase
            .from("clientes_kiosk")
            .select("nome")
            .eq("id", clienteId)
            .maybeSingle();

          if (cdata?.nome) setClienteNome(cdata.nome);
        }
      } catch (err) {
        console.error("Erro inesperado ao carregar histórico", err);
      } finally {
        setCarregando(false);
      }
    };

    init();
  }, [clienteId, clienteNomeStore, navigate]);

  // Cálculos baseados no historico
  const diaHoje = new Date().getDate();
  const diaLimite = historico?.dia_limite ?? 5;

  const comprasMesAtual = historico?.compras_mes_atual ?? [];
  const comprasMesAnterior = historico?.compras_mes_anterior ?? [];
  const comprasAtrasadas = historico?.compras_atrasadas ?? [];

  const totalMesAnterior = useMemo(() =>
    comprasMesAnterior.reduce((sum, c) => sum + Number(c.valor_total || 0), 0),
    [comprasMesAnterior]
  );

  const totalAtrasado = useMemo(() =>
    comprasAtrasadas.reduce((sum, c) => sum + Number(c.valor_total || 0), 0),
    [comprasAtrasadas]
  );

  const temMesAnteriorAberto = comprasMesAnterior.length > 0;
  const temAtrasadas = comprasAtrasadas.length > 0;

  // Lógica dos botões de cobrança
  const mostrarBotaoPagar = temMesAnteriorAberto && diaHoje <= diaLimite;
  const mostrarBotaoAtrasada = temMesAnteriorAberto && diaHoje > diaLimite;
  const mostrarSoAtrasadasAntigas = !temMesAnteriorAberto && temAtrasadas;

  // Valor do botão de atraso inclui mês anterior se passou do dia limite
  const valorBotaoAtrasada = mostrarBotaoAtrasada
    ? totalMesAnterior + totalAtrasado
    : totalAtrasado;

  // Combina compras para exibição quando clica no botão atrasada
  const comprasParaExibirAtrasadas = mostrarBotaoAtrasada
    ? [...comprasMesAnterior, ...comprasAtrasadas]
    : comprasAtrasadas;

  const formatarDataHora = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("pt-BR");
    } catch {
      return iso;
    }
  };

  const totalLote = (lote: CompraHistorico[]) =>
    lote.reduce((sum, c) => sum + Number(c.valor_total || 0), 0);

  const renderCompras = (compras: CompraHistorico[]) => (
    <>
      {compras.map((compra, index) => (
        <div key={compra.compra_id}>
          <Card className="rounded-2xl">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">
                  {formatarDataHora(compra.criado_em)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {compra.forma_pagamento}
                </div>
              </div>

              <div className="flex flex-col gap-1 mt-1">
                {compra.itens.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div className="flex-1">
                      {it.nome}
                    </div>
                    <div className="text-muted-foreground text-xs mx-2">
                      {it.quantidade}x R$ {Number(it.valor_unitario).toFixed(2)}
                    </div>
                    <div className="font-medium">
                      R$ {Number(it.valor_total).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          {index < compras.length - 1 && <div className="h-2" />}
        </div>
      ))}
    </>
  );

  return (
    <div className="min-h-screen p-4 flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Área do Cliente</h1>

        <div className="flex items-center justify-between gap-2">
          <div className="text-lg font-semibold">
            {clienteNome || "Cliente"}
          </div>

          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => navigate("/cart")}
            disabled={!checkout.clienteId}
          >
            Iniciar compra
          </Button>
        </div>

        {/* Botão: Fatura para pagar até o dia X */}
        {mostrarBotaoPagar && (
          <Collapsible open={showMesAnterior} onOpenChange={setShowMesAnterior}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="w-full bg-red-100 hover:bg-red-200 text-red-700 border-red-300 justify-between"
              >
                <span>Fatura de R$ {totalMesAnterior.toFixed(2)} para pagar até o dia {diaLimite}</span>
                {showMesAnterior ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-2">
              {renderCompras(comprasMesAnterior)}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Botão: Fatura atrasada (após dia limite ou só atrasadas antigas) */}
        {(mostrarBotaoAtrasada || mostrarSoAtrasadasAntigas) && (
          <Collapsible open={showAtrasadas} onOpenChange={setShowAtrasadas}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="w-full bg-red-200 hover:bg-red-300 text-red-800 border-red-400 justify-between"
              >
                <span>Fatura atrasada no valor de R$ {valorBotaoAtrasada.toFixed(2)}</span>
                {showAtrasadas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-2">
              {renderCompras(comprasParaExibirAtrasadas)}
            </CollapsibleContent>
          </Collapsible>
        )}
      </header>

      {carregando && (
        <div className="text-center text-muted-foreground mt-6">
          Carregando histórico...
        </div>
      )}

      {!carregando && comprasMesAtual.length === 0 && (
        <div className="text-center text-muted-foreground mt-6">
          Nenhuma compra em aberto neste mês.
        </div>
      )}

      {!carregando && comprasMesAtual.length > 0 && (
        <div className="flex flex-col gap-6">
          {/* FATURA DO MÊS */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Fatura do mês</h2>
              <div className="text-sm font-semibold">
                Total: R$ {totalLote(comprasMesAtual).toFixed(2)}
              </div>
            </div>

            {renderCompras(comprasMesAtual)}
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

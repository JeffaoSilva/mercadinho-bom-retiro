import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCheckout } from "@/hooks/useCheckout";
import { useConfigRealtime } from "@/hooks/useConfigRealtime";
import { useConfigSistemaStore } from "@/stores/configSistemaStore";
import { ChevronDown, ChevronUp } from "lucide-react";
import BackButton from "@/components/BackButton";

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

type AbatimentoHistorico = {
  id: number;
  valor: number;
  criado_em: string;
};

type HistoricoPayload = {
  mes_atual: string;
  mes_anterior: string;
  data_limite: string | null;
  compras_mes_atual: CompraHistorico[];
  compras_mes_anterior: CompraHistorico[];
  compras_atrasadas: CompraHistorico[];
};

export default function AreaCliente() {
  const navigate = useNavigate();
  const params = useParams<{ clienteId: string }>();
  const checkout = useCheckout();

  useConfigRealtime();
  const { configPagamentos } = useConfigSistemaStore();

  const clienteIdStore = checkout.clienteId;
  const clienteNomeStore = checkout.clienteNome;
  const clienteIdRota = params.clienteId ? Number(params.clienteId) : null;
  const clienteId = clienteIdStore || clienteIdRota;

  const [clienteNome, setClienteNome] = useState<string>(clienteNomeStore || "");
  const [historico, setHistorico] = useState<HistoricoPayload | null>(null);
  const [abatimentos, setAbatimentos] = useState<AbatimentoHistorico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [showMesAnterior, setShowMesAnterior] = useState(false);
  const [showAtrasadas, setShowAtrasadas] = useState(false);

  const fetchHistorico = async () => {
    if (!clienteId) return;

    const [historicoRes, abatimentosRes] = await Promise.all([
      supabase.rpc("cliente_historico", { p_cliente_id: clienteId }),
      supabase
        .from("abatimentos" as any)
        .select("id, valor, criado_em")
        .eq("cliente_id", clienteId)
        .order("criado_em", { ascending: false }),
    ]);

    if (historicoRes.error) {
      console.error("Erro buscando histórico", historicoRes.error);
      setHistorico(null);
    } else {
      setHistorico(historicoRes.data as HistoricoPayload);
    }

    setAbatimentos((abatimentosRes.data || []) as unknown as AbatimentoHistorico[]);
  };

  useEffect(() => {
    const init = async () => {
      if (!clienteId) {
        navigate("/area-cliente");
        return;
      }

      setCarregando(true);

      try {
        await fetchHistorico();

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

  const dataLimiteRealtime = useMemo(() => {
    if (!historico) return null;
    const configMesAnterior = configPagamentos.find(
      (c) => c.mes_referencia === historico.mes_anterior
    );
    return configMesAnterior?.data_limite || historico.data_limite;
  }, [configPagamentos, historico]);

  const comprasMesAtual = historico?.compras_mes_atual ?? [];
  const comprasMesAnterior = historico?.compras_mes_anterior ?? [];
  const comprasAtrasadas = historico?.compras_atrasadas ?? [];

  const totalAbatimentos = useMemo(() =>
    abatimentos.reduce((sum, a) => sum + Number(a.valor), 0),
    [abatimentos]
  );

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

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const dataLimiteParsed = dataLimiteRealtime ? new Date(dataLimiteRealtime + "T00:00:00") : null;

  const mostrarBotaoPagar = temMesAnteriorAberto && (!dataLimiteParsed || hoje <= dataLimiteParsed);
  const mostrarBotaoAtrasada = temMesAnteriorAberto && dataLimiteParsed && hoje > dataLimiteParsed;
  const mostrarSoAtrasadasAntigas = !temMesAnteriorAberto && temAtrasadas;

  const valorBotaoAtrasada = mostrarBotaoAtrasada
    ? totalMesAnterior + totalAtrasado
    : totalAtrasado;

  const comprasParaExibirAtrasadas = mostrarBotaoAtrasada
    ? [...comprasMesAnterior, ...comprasAtrasadas]
    : comprasAtrasadas;

  const formatarDataLimite = (dataStr: string | null) => {
    if (!dataStr) return null;
    const [ano, mes, dia] = dataStr.split("-");
    return `${dia}/${mes}`;
  };

  const dataLimiteFormatada = formatarDataLimite(dataLimiteRealtime);

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

  const renderAbatimentos = () => {
    if (abatimentos.length === 0) return null;
    return (
      <>
        {abatimentos.map((ab) => (
          <div key={ab.id}>
            <Card className="rounded-2xl border-green-200 bg-green-50">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm text-green-700">Abatimento</div>
                  <div className="text-xs text-green-600">{formatarDataHora(ab.criado_em)}</div>
                </div>
                <div className="font-bold text-green-700">
                  -R$ {Number(ab.valor).toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <div className="h-2" />
          </div>
        ))}
      </>
    );
  };

  return (
    <div className="min-h-screen p-4 flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-4">
          <BackButton to="/" />
          <h1 className="text-2xl font-bold">Área do Cliente</h1>
        </div>

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

        {/* Botão: Fatura para pagar (AZUL SUAVE) */}
        {mostrarBotaoPagar && (
          <Collapsible open={showMesAnterior} onOpenChange={setShowMesAnterior}>
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="w-full bg-blue-100 hover:bg-blue-200 text-blue-700 border-blue-300 justify-between"
              >
                <span>
                  Fatura de R$ {totalMesAnterior.toFixed(2)}
                  {dataLimiteFormatada ? ` para pagar até o dia ${dataLimiteFormatada}` : " para pagar"}
                </span>
                {showMesAnterior ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-2">
              {renderCompras(comprasMesAnterior)}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Botão: Fatura atrasada (VERMELHO FORTE) */}
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

      {!carregando && comprasMesAtual.length === 0 && abatimentos.length === 0 && (
        <div className="text-center text-muted-foreground mt-6">
          Nenhuma compra em aberto neste mês.
        </div>
      )}

      {!carregando && (comprasMesAtual.length > 0 || abatimentos.length > 0) && (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Fatura do mês</h2>
              <div className="text-sm font-semibold">
                Total: R$ {Math.max(totalLote(comprasMesAtual) - totalAbatimentos, 0).toFixed(2)}
              </div>
            </div>

            {renderAbatimentos()}
            {renderCompras(comprasMesAtual)}
          </section>
        </div>
      )}

    </div>
  );
}

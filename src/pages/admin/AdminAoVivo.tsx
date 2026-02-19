import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  Radio,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useConfigNotifStore, ConfigNotif } from "@/stores/configNotifStore";
import { useSaleNotifications } from "@/hooks/useSaleNotifications";
import { MercadinhoBadge } from "@/components/admin/MercadinhoBadge";
import { format } from "date-fns";

// ⚠️ IMPORTANTE: A tabela `compras` precisa estar com Realtime habilitado no Supabase:
// Dashboard > Database > Replication > Supabase Realtime > habilitar `compras`

interface VendaFeed {
  id: number;
  hora: string;
  mercadinho_id: number;
  mercadinho_nome: string;
  cliente_nome: string;
  valor_total: number;
  itens_resumo: string;
}

type RealtimeStatus = "connecting" | "connected" | "error" | "disconnected";

const AdminAoVivo = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  const config = useConfigNotifStore((s) => s.config);
  const setConfig = useConfigNotifStore((s) => s.setConfig);

  const [isMuted, setIsMuted] = useState(false);
  const [feedFilter, setFeedFilter] = useState<"todos" | 1 | 2>("todos");
  const [vendas, setVendas] = useState<VendaFeed[]>([]);
  const [contadorBR, setContadorBR] = useState<number>(0);
  const [contadorSF, setContadorSF] = useState<number>(0);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configMercadinho, setConfigMercadinho] = useState<1 | 2>(1);
  const [tempMetrica, setTempMetrica] = useState("qtd");
  const [tempPeriodo, setTempPeriodo] = useState("dia");
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");

  // Guard para não criar subscription duplicada
  const feedChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Hook global de notificações (toast + som) — não criar subscription duplicada
  const { setOnNewSale } = useSaleNotifications({ isAoVivoMuted: isMuted });

  // ─── Carregar dados iniciais ────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadVendasRecentes();
    loadContadores();
  }, [isAuthenticated, authLoading, navigate]);

  // Atualizar contadores quando config muda
  useEffect(() => {
    if (isAuthenticated) loadContadores();
  }, [config, isAuthenticated]);

  // ─── Subscription própria do feed Ao Vivo ─────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    if (feedChannelRef.current) return; // guard anti-duplicata

    console.log("[AdminAoVivo] Criando subscription do feed em 'compras'...");
    setRealtimeStatus("connecting");

    const channel = supabase
      .channel("ao_vivo_feed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "compras",
        },
        async (payload) => {
          const newSale = payload.new as {
            id: number;
            mercadinho_id: number;
            valor_total: number;
            cliente_id: number | null;
            eh_visitante: boolean;
            criado_em: string;
          };

          console.log("[AdminAoVivo] Nova venda no feed:", newSale);

          // Buscar nome do cliente
          let clienteNome = "Visitante";
          if (newSale.cliente_id && !newSale.eh_visitante) {
            const { data: cliente } = await supabase
              .from("clientes")
              .select("nome")
              .eq("id", newSale.cliente_id)
              .maybeSingle();
            if (cliente) clienteNome = cliente.nome;
          }

          const mercadinhoNome =
            newSale.mercadinho_id === 1 ? "Bom Retiro" : "São Francisco";

          // Buscar itens com retry (podem ainda não estar commitados)
          let itensResumo = "(carregando...)";
          for (let attempt = 0; attempt < 3; attempt++) {
            const { data: itens } = await supabase
              .from("itens_compra")
              .select("quantidade, produtos(nome)")
              .eq("compra_id", newSale.id);

            if (itens && itens.length > 0) {
              itensResumo = itens
                .map((item: any) => `${item.produtos?.nome || "?"} ${item.quantidade}x`)
                .join(", ");
              break;
            }
            await new Promise((r) =>
              setTimeout(r, attempt === 0 ? 300 : 800)
            );
          }

          const novaVenda: VendaFeed = {
            id: newSale.id,
            hora: format(new Date(), "HH:mm"),
            mercadinho_id: newSale.mercadinho_id,
            mercadinho_nome: mercadinhoNome,
            cliente_nome: clienteNome,
            valor_total: newSale.valor_total,
            itens_resumo: itensResumo,
          };

          setVendas((prev) => [novaVenda, ...prev].slice(0, 50));
          // Atualizar contadores após nova venda
          loadContadores();
        }
      )
      .subscribe((status) => {
        console.log(`[AdminAoVivo] Status da subscription do feed: ${status}`);
        if (status === "SUBSCRIBED") {
          console.log("[AdminAoVivo] ✅ Feed realtime conectado");
          setRealtimeStatus("connected");
        } else if (
          status === "TIMED_OUT" ||
          status === "CHANNEL_ERROR" ||
          status === "CLOSED"
        ) {
          console.error(`[AdminAoVivo] ❌ Falha no feed realtime: ${status}`);
          setRealtimeStatus("error");
        }
      });

    feedChannelRef.current = channel;

    return () => {
      if (feedChannelRef.current) {
        console.log("[AdminAoVivo] Removendo subscription do feed...");
        supabase.removeChannel(feedChannelRef.current);
        feedChannelRef.current = null;
      }
    };
  }, [isAuthenticated]);

  // ─── Carregar vendas recentes ───────────────────────────────────────────────
  const loadVendasRecentes = async () => {
    const { data } = await supabase
      .from("compras")
      .select(`
        id,
        criado_em,
        mercadinho_id,
        cliente_id,
        eh_visitante,
        valor_total,
        clientes(nome)
      `)
      .order("criado_em", { ascending: false })
      .limit(50);

    if (!data) return;

    const vendasComItens: VendaFeed[] = [];
    for (const compra of data) {
      const { data: itens } = await supabase
        .from("itens_compra")
        .select("quantidade, produtos(nome)")
        .eq("compra_id", compra.id);

      const itensResumo = itens
        ? itens
            .map((item: any) => `${item.produtos?.nome || "?"} ${item.quantidade}x`)
            .join(", ")
        : "";

      vendasComItens.push({
        id: compra.id,
        hora: format(new Date(compra.criado_em), "HH:mm"),
        mercadinho_id: compra.mercadinho_id,
        mercadinho_nome:
          compra.mercadinho_id === 1 ? "Bom Retiro" : "São Francisco",
        cliente_nome: compra.eh_visitante
          ? "Visitante"
          : (compra.clientes as any)?.nome || "Visitante",
        valor_total: compra.valor_total,
        itens_resumo: itensResumo,
      });
    }
    setVendas(vendasComItens);
  };

  // ─── Contadores ────────────────────────────────────────────────────────────
  const loadContadores = async () => {
    const valorBR = await calcularContador(
      1,
      config.ao_vivo_contador_br_metrica,
      config.ao_vivo_contador_br_periodo
    );
    setContadorBR(valorBR);

    const valorSF = await calcularContador(
      2,
      config.ao_vivo_contador_sf_metrica,
      config.ao_vivo_contador_sf_periodo
    );
    setContadorSF(valorSF);
  };

  const calcularContador = async (
    mercadinhoId: number,
    metrica: string,
    periodo: string
  ): Promise<number> => {
    const now = new Date();
    let dataInicio: Date;

    if (periodo === "dia") {
      dataInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (periodo === "semana") {
      dataInicio = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      dataInicio = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const { data, error } = await supabase
      .from("compras")
      .select("valor_total")
      .eq("mercadinho_id", mercadinhoId)
      .gte("criado_em", dataInicio.toISOString());

    if (error || !data) return 0;

    if (metrica === "qtd") {
      return data.length;
    } else {
      return data.reduce((sum, c) => sum + (c.valor_total || 0), 0);
    }
  };

  // ─── Config de contador ────────────────────────────────────────────────────
  const abrirConfigContador = (mercadinho: 1 | 2) => {
    setConfigMercadinho(mercadinho);
    if (mercadinho === 1) {
      setTempMetrica(config.ao_vivo_contador_br_metrica);
      setTempPeriodo(config.ao_vivo_contador_br_periodo);
    } else {
      setTempMetrica(config.ao_vivo_contador_sf_metrica);
      setTempPeriodo(config.ao_vivo_contador_sf_periodo);
    }
    setShowConfigModal(true);
  };

  const salvarConfigContador = async () => {
    const updates: Partial<ConfigNotif> = {};

    if (configMercadinho === 1) {
      updates.ao_vivo_contador_br_metrica = tempMetrica;
      updates.ao_vivo_contador_br_periodo = tempPeriodo;
    } else {
      updates.ao_vivo_contador_sf_metrica = tempMetrica;
      updates.ao_vivo_contador_sf_periodo = tempPeriodo;
    }

    setConfig(updates);
    setShowConfigModal(false);

    const { error } = await supabase
      .from("config_sistema")
      .update(updates)
      .eq("id", 1);

    if (error) {
      if (configMercadinho === 1) {
        setConfig({
          ao_vivo_contador_br_metrica: config.ao_vivo_contador_br_metrica,
          ao_vivo_contador_br_periodo: config.ao_vivo_contador_br_periodo,
        });
      } else {
        setConfig({
          ao_vivo_contador_sf_metrica: config.ao_vivo_contador_sf_metrica,
          ao_vivo_contador_sf_periodo: config.ao_vivo_contador_sf_periodo,
        });
      }
      toast.error("Erro ao salvar configuração");
    } else {
      toast.success("Configuração salva!");
    }
  };

  const formatarValorContador = (valor: number, metrica: string) => {
    if (metrica === "qtd") return valor.toString();
    return `R$ ${valor.toFixed(2)}`;
  };

  const getPeriodoLabel = (periodo: string) => {
    switch (periodo) {
      case "dia": return "Hoje";
      case "semana": return "Semana";
      case "mes": return "Mês";
      default: return periodo;
    }
  };

  const getMetricaLabel = (metrica: string) =>
    metrica === "qtd" ? "Vendas" : "Total";

  const vendasFiltradas =
    feedFilter === "todos"
      ? vendas
      : vendas.filter((v) => v.mercadinho_id === feedFilter);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Radio className="h-6 w-6 text-destructive animate-pulse" />
              <h1 className="text-2xl sm:text-3xl font-bold">Ao Vivo</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Indicador de status Realtime */}
            <div
              title={
                realtimeStatus === "connected"
                  ? "Realtime conectado"
                  : realtimeStatus === "connecting"
                  ? "Conectando..."
                  : "Realtime desconectado"
              }
              className="flex items-center gap-1"
            >
            {realtimeStatus === "connected" ? (
                <Wifi className="h-4 w-4 text-primary" />
              ) : realtimeStatus === "connecting" ? (
                <Wifi className="h-4 w-4 text-muted-foreground animate-pulse" />
              ) : (
                <WifiOff className="h-4 w-4 text-destructive" />
              )}
              <span
                className={`text-xs ${
                  realtimeStatus === "connected"
                    ? "text-primary"
                    : realtimeStatus === "connecting"
                    ? "text-muted-foreground"
                    : "text-destructive"
                }`}
              >
                {realtimeStatus === "connected"
                  ? "Ao vivo"
                  : realtimeStatus === "connecting"
                  ? "Conectando"
                  : "Desconectado"}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? "Ativar som" : "Mutar som"}
            >
              {isMuted ? (
                <VolumeX className="h-6 w-6 text-muted-foreground" />
              ) : (
                <Volume2 className="h-6 w-6 text-primary" />
              )}
            </Button>
          </div>
        </div>

        {/* Contadores */}
        <div className="grid grid-cols-2 gap-4">
          {/* BR */}
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => abrirConfigContador(1)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Bom Retiro</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                {getMetricaLabel(config.ao_vivo_contador_br_metrica)} •{" "}
                {getPeriodoLabel(config.ao_vivo_contador_br_periodo)}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">
                {formatarValorContador(contadorBR, config.ao_vivo_contador_br_metrica)}
              </p>
            </CardContent>
          </Card>

          {/* SF */}
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => abrirConfigContador(2)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">São Francisco</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                {getMetricaLabel(config.ao_vivo_contador_sf_metrica)} •{" "}
                {getPeriodoLabel(config.ao_vivo_contador_sf_periodo)}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">
                {formatarValorContador(contadorSF, config.ao_vivo_contador_sf_metrica)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filtro do Feed */}
        <div className="flex gap-2">
          <Button
            variant={feedFilter === "todos" ? "default" : "outline"}
            size="sm"
            onClick={() => setFeedFilter("todos")}
          >
            Todos
          </Button>
          <Button
            variant={feedFilter === 1 ? "default" : "outline"}
            size="sm"
            onClick={() => setFeedFilter(1)}
          >
            BR
          </Button>
          <Button
            variant={feedFilter === 2 ? "default" : "outline"}
            size="sm"
            onClick={() => setFeedFilter(2)}
          >
            SF
          </Button>
        </div>

        {/* Feed de Vendas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Últimas Vendas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-y-auto">
              {vendasFiltradas.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma venda recente
                </p>
              ) : (
                <div className="divide-y">
                  {vendasFiltradas.map((venda) => (
                    <div key={venda.id} className="p-3 hover:bg-accent/30">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-muted-foreground">
                            {venda.hora}
                          </span>
                          <MercadinhoBadge
                            mercadinhoId={venda.mercadinho_id}
                            nomeLoja={venda.mercadinho_nome}
                          />
                          <span className="font-medium">{venda.cliente_nome}</span>
                        </div>
                        <span className="font-bold text-primary">
                          R$ {venda.valor_total.toFixed(2)}
                        </span>
                      </div>
                      {venda.itens_resumo && (
                        <p className="text-xs text-muted-foreground mt-1 ml-14">
                          {venda.itens_resumo}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal Config Contador */}
      <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Configurar Contador —{" "}
              {configMercadinho === 1 ? "Bom Retiro" : "São Francisco"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Métrica</Label>
              <Select value={tempMetrica} onValueChange={setTempMetrica}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qtd">Quantidade de vendas</SelectItem>
                  <SelectItem value="valor">Total vendido (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Período</Label>
              <Select value={tempPeriodo} onValueChange={setTempPeriodo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dia">Hoje</SelectItem>
                  <SelectItem value="semana">Últimos 7 dias</SelectItem>
                  <SelectItem value="mes">Mês corrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigModal(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarConfigContador}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAoVivo;

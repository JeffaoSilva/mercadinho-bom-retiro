import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useConfigNotifStore } from "@/stores/configNotifStore";
import { playNotifyBeep } from "@/utils/notifySounds";
import { toast } from "sonner";
import { showSaleToast } from "@/utils/saleToast";

// ⚠️ IMPORTANTE: Para o Realtime funcionar, a tabela `compras` precisa estar
// com Realtime habilitado no Supabase Dashboard:
// Database > Replication > Supabase Realtime > habilitar a tabela `compras`

interface SaleNotificationOptions {
  isAoVivoMuted?: boolean;
}

interface QueuedNotification {
  mercadinhoNome: string;
  mercadinhoId: number;
  clienteNome: string;
  valorTotal: number;
  beepKey: "beep1" | "beep2" | "beep3" | "beep4";
  volume: number;
  shouldPlaySound: boolean;
  shouldShowPopup: boolean;
}

export function useSaleNotifications(options: SaleNotificationOptions = {}) {
  const location = useLocation();
  const config = useConfigNotifStore((s) => s.config);
  const isAoVivoMuted = options.isAoVivoMuted ?? false;

  const isAdminRoute = location.pathname.startsWith("/admin");
  const isAoVivoRoute = location.pathname === "/admin/ao-vivo";

  // Guarda para não criar subscription duplicada
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Ref para o callback de nova venda (usado na tela Ao Vivo via setOnNewSale)
  const onNewSaleRef = useRef<((sale: unknown) => void) | null>(null);

  // Ref para config e mute, para evitar re-criar subscription a cada mudança
  const configRef = useRef(config);
  const isAoVivoMutedRef = useRef(isAoVivoMuted);
  const isAoVivoRouteRef = useRef(isAoVivoRoute);

  // Fila de notificações e estado do processador
  const queueRef = useRef<QueuedNotification[]>([]);
  const isProcessingRef = useRef(false);
  const processorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { isAoVivoMutedRef.current = isAoVivoMuted; }, [isAoVivoMuted]);
  useEffect(() => { isAoVivoRouteRef.current = isAoVivoRoute; }, [isAoVivoRoute]);

  const setOnNewSale = (callback: (sale: unknown) => void) => {
    onNewSaleRef.current = callback;
  };

  // Processa a fila sequencialmente: toast + som juntos, aguarda ~2s antes do próximo
  const processQueue = () => {
    if (isProcessingRef.current) return;
    if (queueRef.current.length === 0) return;

    isProcessingRef.current = true;
    const item = queueRef.current.shift()!;

    // Mostrar toast e tocar som JUNTOS (sincronizados)
    if (item.shouldShowPopup) {
      showSaleToast({
        mercadinhoNome: item.mercadinhoNome,
        mercadinhoId: item.mercadinhoId,
        clienteNome: item.clienteNome,
        valorTotal: item.valorTotal,
      });
    }

    if (item.shouldPlaySound) {
      playNotifyBeep(item.beepKey, item.volume);
    }

    // Aguardar ~2s antes de processar o próximo da fila
    processorTimerRef.current = setTimeout(() => {
      isProcessingRef.current = false;
      processQueue();
    }, 2000);
  };

  // Enfileira uma notificação e dispara o processador se estiver ocioso
  const enqueueNotification = (item: QueuedNotification) => {
    queueRef.current.push(item);
    if (!isProcessingRef.current) {
      processQueue();
    }
  };

  useEffect(() => {
    if (!isAdminRoute) return;
    // Guard: não criar subscription duplicada
    if (channelRef.current) return;

    console.log("[SaleNotifications] Criando subscription em 'compras'...");

    const channel = supabase
      .channel("global_sales_notifications")
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
          };

          console.log("[SaleNotifications] Nova venda detectada:", newSale);

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

          // Disparar callback para Ao Vivo (se estiver montado)
          if (onNewSaleRef.current) {
            onNewSaleRef.current({
              ...newSale,
              cliente_nome: clienteNome,
              mercadinho_nome: mercadinhoNome,
            });
          }

          const cfg = configRef.current;

          const shouldPlaySound =
            cfg.notif_venda_som_ativo &&
            (!isAoVivoRouteRef.current || !isAoVivoMutedRef.current);

          const beepKey = (
            newSale.mercadinho_id === 1
              ? cfg.notif_venda_som_br
              : cfg.notif_venda_som_sf
          ) as "beep1" | "beep2" | "beep3" | "beep4";

          const shouldShowPopup =
            !isAoVivoRouteRef.current && cfg.notif_venda_popup_ativo;

          // Enfileirar: toast + som serão exibidos juntos, sem sobreposição
          enqueueNotification({
            mercadinhoNome,
            mercadinhoId: newSale.mercadinho_id,
            clienteNome,
            valorTotal: newSale.valor_total,
            beepKey,
            volume: cfg.notif_venda_som_volume,
            shouldPlaySound,
            shouldShowPopup,
          });
        }
      )
      .subscribe((status) => {
        console.log(`[SaleNotifications] Status da subscription: ${status}`);
        if (status === "SUBSCRIBED") {
          console.log(
            "[SaleNotifications] ✅ Realtime conectado — escutando INSERT em 'compras'"
          );
        } else if (
          status === "TIMED_OUT" ||
          status === "CHANNEL_ERROR" ||
          status === "CLOSED"
        ) {
          console.error(
            `[SaleNotifications] ❌ Falha na subscription: ${status}`
          );
          toast.error(
            "⚠️ Realtime desconectado. Atualize a página se necessário.",
            {
              id: "realtime-error",
              duration: 8000,
            }
          );
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        console.log("[SaleNotifications] Removendo subscription...");
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      // Limpar timer da fila ao desmontar
      if (processorTimerRef.current) {
        clearTimeout(processorTimerRef.current);
        processorTimerRef.current = null;
      }
      isProcessingRef.current = false;
      queueRef.current = [];
    };
  // Apenas re-cria se a rota mudar de admin para não-admin
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminRoute]);

  return { setOnNewSale };
}

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useConfigNotifStore } from "@/stores/configNotifStore";
import { playNotifyBeep } from "@/utils/notifySounds";
import { toast } from "sonner";

// ⚠️ IMPORTANTE: Para o Realtime funcionar, a tabela `compras` precisa estar
// com Realtime habilitado no Supabase Dashboard:
// Database > Replication > Supabase Realtime > habilitar a tabela `compras`

interface SaleNotificationOptions {
  isAoVivoMuted?: boolean;
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
  const onNewSaleRef = useRef<((sale: any) => void) | null>(null);

  // Ref para config e mute, para evitar re-criar subscription a cada mudança
  const configRef = useRef(config);
  const isAoVivoMutedRef = useRef(isAoVivoMuted);
  const isAoVivoRouteRef = useRef(isAoVivoRoute);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { isAoVivoMutedRef.current = isAoVivoMuted; }, [isAoVivoMuted]);
  useEffect(() => { isAoVivoRouteRef.current = isAoVivoRoute; }, [isAoVivoRoute]);

  const setOnNewSale = (callback: (sale: any) => void) => {
    onNewSaleRef.current = callback;
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

          const mercadinhoNome = newSale.mercadinho_id === 1 ? "Bom Retiro" : "São Francisco";

          // Disparar callback para Ao Vivo (se estiver montado)
          if (onNewSaleRef.current) {
            onNewSaleRef.current({
              ...newSale,
              cliente_nome: clienteNome,
              mercadinho_nome: mercadinhoNome,
            });
          }

          const cfg = configRef.current;

          // Tocar som
          const shouldPlaySound =
            cfg.notif_venda_som_ativo &&
            (!isAoVivoRouteRef.current || !isAoVivoMutedRef.current);

          if (shouldPlaySound) {
            const beepKey =
              newSale.mercadinho_id === 1
                ? cfg.notif_venda_som_br
                : cfg.notif_venda_som_sf;
            playNotifyBeep(
              beepKey as "beep1" | "beep2" | "beep3" | "beep4",
              cfg.notif_venda_som_volume
            );
          }

          // Mostrar popup (apenas fora do Ao Vivo)
          if (!isAoVivoRouteRef.current && cfg.notif_venda_popup_ativo) {
            toast.success(
              `🛒 ${mercadinhoNome} — R$ ${newSale.valor_total.toFixed(2)} — ${clienteNome}`,
              { duration: 5000 }
            );
          }
        }
      )
      .subscribe((status) => {
        console.log(`[SaleNotifications] Status da subscription: ${status}`);
        if (status === "SUBSCRIBED") {
          console.log("[SaleNotifications] ✅ Realtime conectado — escutando INSERT em 'compras'");
        } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED") {
          console.error(`[SaleNotifications] ❌ Falha na subscription: ${status}`);
          // Toast apenas no Admin (não notificar em rotas públicas)
          toast.error("⚠️ Realtime desconectado. Atualize a página se necessário.", {
            id: "realtime-error",
            duration: 8000,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        console.log("[SaleNotifications] Removendo subscription...");
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  // Apenas re-cria se a rota mudar de admin para não-admin
  }, [isAdminRoute]);

  return { setOnNewSale };
}

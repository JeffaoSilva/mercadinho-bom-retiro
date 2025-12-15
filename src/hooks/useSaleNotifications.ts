import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useConfigNotifStore } from "@/stores/configNotifStore";
import { playNotifyBeep } from "@/utils/notifySounds";
import { toast } from "sonner";

interface SaleNotificationOptions {
  isAoVivoMuted?: boolean;
}

export function useSaleNotifications(options: SaleNotificationOptions = {}) {
  const location = useLocation();
  const config = useConfigNotifStore((s) => s.config);
  const isAoVivoMuted = options.isAoVivoMuted ?? false;

  const isAdminRoute = location.pathname.startsWith("/admin");
  const isAoVivoRoute = location.pathname === "/admin/ao-vivo";

  // Ref para callback de nova venda (usado na tela Ao Vivo)
  const onNewSaleRef = useRef<((sale: any) => void) | null>(null);

  const setOnNewSale = (callback: (sale: any) => void) => {
    onNewSaleRef.current = callback;
  };

  useEffect(() => {
    if (!isAdminRoute) return;

    const channel = supabase
      .channel("sales_notifications")
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

          console.log("[SaleNotification] Nova venda detectada:", newSale);

          // Buscar nome do cliente se houver
          let clienteNome = "Visitante";
          if (newSale.cliente_id && !newSale.eh_visitante) {
            const { data: cliente } = await supabase
              .from("clientes")
              .select("nome")
              .eq("id", newSale.cliente_id)
              .maybeSingle();
            if (cliente) {
              clienteNome = cliente.nome;
            }
          }

          // Buscar nome do mercadinho
          let mercadinhoNome = newSale.mercadinho_id === 1 ? "Bom Retiro" : "São Francisco";

          // Callback para Ao Vivo
          if (onNewSaleRef.current) {
            onNewSaleRef.current({
              ...newSale,
              cliente_nome: clienteNome,
              mercadinho_nome: mercadinhoNome,
            });
          }

          // Tocar som
          const shouldPlaySound =
            config.notif_venda_som_ativo &&
            (!isAoVivoRoute || !isAoVivoMuted);

          if (shouldPlaySound) {
            const beepKey =
              newSale.mercadinho_id === 1
                ? config.notif_venda_som_br
                : config.notif_venda_som_sf;
            playNotifyBeep(
              beepKey as "beep1" | "beep2" | "beep3" | "beep4",
              config.notif_venda_som_volume
            );
          }

          // Mostrar popup (apenas fora do Ao Vivo)
          if (!isAoVivoRoute && config.notif_venda_popup_ativo) {
            toast.success(
              `🛒 Nova venda — ${mercadinhoNome} — R$ ${newSale.valor_total.toFixed(2)} — ${clienteNome}`,
              { duration: 5000 }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdminRoute, isAoVivoRoute, isAoVivoMuted, config]);

  return { setOnNewSale };
}

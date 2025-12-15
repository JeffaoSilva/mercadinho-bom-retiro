import { useConfigNotifRealtime } from "@/hooks/useConfigNotifRealtime";
import { useSaleNotifications } from "@/hooks/useSaleNotifications";

/**
 * Componente wrapper que inicializa as notificações de venda no Admin
 * Deve ser usado dentro de rotas /admin/*
 */
export function AdminNotifications() {
  // Carrega config de notificações em tempo real
  useConfigNotifRealtime();
  
  // Ativa notificações de venda (popup + som)
  useSaleNotifications();

  return null;
}

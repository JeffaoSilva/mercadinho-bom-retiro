import { useRef, useCallback } from "react";
import { toast } from "sonner";

/**
 * Hook para copiar valor ao pressionar e segurar (long press) um elemento.
 * Não interfere no clique normal: o clique só dispara se NÃO houve long press.
 */
export function useLongPressCopy(delay: number = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredRef = useRef(false);

  const copyValue = useCallback(async (value: string, label: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback para ambientes sem Clipboard API
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }, []);

  const start = useCallback(
    (value: string, label: string) => {
      triggeredRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        triggeredRef.current = true;
        copyValue(value, label);
      }, delay);
    },
    [copyValue, delay]
  );

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Retorna handlers para um elemento. `value` é o que será copiado e `label`
   * é o nome amigável usado no toast ("Nome", "Código", etc.).
   * `onClick` opcional: só dispara se o long press NÃO ocorreu.
   */
  const getHandlers = useCallback(
    (value: string, label: string, onClick?: () => void) => ({
      onPointerDown: (e: React.PointerEvent) => {
        // Apenas botão primário / toque
        if (e.pointerType === "mouse" && e.button !== 0) return;
        start(value, label);
      },
      onPointerUp: () => cancel(),
      onPointerLeave: () => cancel(),
      onPointerCancel: () => cancel(),
      onContextMenu: (e: React.MouseEvent) => {
        // Em alguns devices long-press dispara contextmenu — suprimimos
        e.preventDefault();
      },
      onClick: (e: React.MouseEvent) => {
        if (triggeredRef.current) {
          e.preventDefault();
          e.stopPropagation();
          triggeredRef.current = false;
          return;
        }
        onClick?.();
      },
      style: {
        userSelect: "none" as const,
        WebkitUserSelect: "none" as const,
        WebkitTouchCallout: "none" as const,
        cursor: "pointer" as const,
      },
    }),
    [start, cancel]
  );

  return { getHandlers };
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MercadinhoBadgeProps {
  mercadinhoId: number;
  nomeLoja: string;
  className?: string;
}

interface BadgeColors {
  badge_bg_color: string | null;
  badge_text_color: string | null;
}

// Cache simples em memória para evitar múltiplas queries
const colorCache: Record<number, BadgeColors> = {};

// Fallback por mercadinho
const FALLBACKS: Record<number, { bg: string; text: string }> = {
  1: { bg: "#1a73e8", text: "#ffffff" }, // Bom Retiro — azul
  2: { bg: "#34a853", text: "#ffffff" }, // São Francisco — verde
};

export function MercadinhoBadge({ mercadinhoId, nomeLoja, className }: MercadinhoBadgeProps) {
  const [colors, setColors] = useState<BadgeColors>({ badge_bg_color: null, badge_text_color: null });

  useEffect(() => {
    // Usar cache se disponível
    if (colorCache[mercadinhoId]) {
      setColors(colorCache[mercadinhoId]);
      return;
    }

    supabase
      .from("mercadinhos")
      .select("badge_bg_color, badge_text_color")
      .eq("id", mercadinhoId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const entry: BadgeColors = {
            badge_bg_color: data.badge_bg_color,
            badge_text_color: data.badge_text_color,
          };
          colorCache[mercadinhoId] = entry;
          setColors(entry);
        }
      });
  }, [mercadinhoId]);

  const fallback = FALLBACKS[mercadinhoId] ?? { bg: "#6b7280", text: "#ffffff" };
  const bg = colors.badge_bg_color || fallback.bg;
  const text = colors.badge_text_color || fallback.text;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${className ?? ""}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {nomeLoja}
    </span>
  );
}

// Exporta também função para invalidar cache (chamada após salvar cores)
export function invalidateMercadinhoBadgeCache(mercadinhoId?: number) {
  if (mercadinhoId !== undefined) {
    delete colorCache[mercadinhoId];
  } else {
    Object.keys(colorCache).forEach((k) => delete colorCache[Number(k)]);
  }
}

import { supabase } from "@/integrations/supabase/client";

// Utilitário para tocar som de beep usando Web Audio API
let audioContext: AudioContext | null = null;

// Cache das configurações (recarrega a cada 30 segundos)
let cachedConfig: { bip_ativo: boolean; bip_volume: number } | null = null;
let lastFetch = 0;
const CACHE_TTL = 30000; // 30 segundos

async function getBeepConfig() {
  const now = Date.now();
  
  if (cachedConfig && now - lastFetch < CACHE_TTL) {
    return cachedConfig;
  }
  
  try {
    const { data } = await supabase
      .from("config_sistema" as any)
      .select("bip_ativo, bip_volume")
      .eq("id", 1)
      .maybeSingle();
    
    if (data) {
      const d = data as any;
      cachedConfig = {
        bip_ativo: d.bip_ativo,
        bip_volume: d.bip_volume,
      };
      lastFetch = now;
    }
  } catch (error) {
    console.warn("Erro ao buscar config de beep:", error);
  }
  
  return cachedConfig || { bip_ativo: true, bip_volume: 70 };
}

export async function playBeep() {
  try {
    const config = await getBeepConfig();
    
    if (!config.bip_ativo) {
      return; // Som desativado
    }
    
    // Cria contexto se não existir
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Se o contexto estiver suspenso (autoplay bloqueado), tenta retomar
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    // Cria oscilador para gerar o beep
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configurações do beep (frequência e volume)
    oscillator.frequency.value = 1000; // 1kHz - tom agudo típico de scanner
    oscillator.type = "square";
    
    // Volume baseado na configuração (0-100 -> 0-0.5)
    const volume = (config.bip_volume / 100) * 0.5;
    
    // Envelope de volume para suavizar
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    // Toca por 100ms
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (error) {
    // Silenciosamente falha se o áudio não estiver disponível
    console.warn("Não foi possível tocar beep:", error);
  }
}

// Função síncrona para casos onde não podemos usar async (mantém compatibilidade)
export function playBeepSync() {
  playBeep().catch(() => {});
}

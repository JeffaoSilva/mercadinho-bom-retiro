// Utilitário para tocar som de beep usando Web Audio API
let audioContext: AudioContext | null = null;

export function playBeep() {
  try {
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
    
    // Envelope de volume para suavizar
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    // Toca por 100ms
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (error) {
    // Silenciosamente falha se o áudio não estiver disponível
    console.warn("Não foi possível tocar beep:", error);
  }
}

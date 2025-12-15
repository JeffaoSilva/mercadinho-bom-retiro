// Utility para tocar sons de notificação de venda
// Usa Web Audio API para gerar 4 beeps diferentes

let audioContext: AudioContext | null = null;

type BeepKey = 'beep1' | 'beep2' | 'beep3' | 'beep4';

const beepConfigs: Record<BeepKey, { frequency: number; duration: number; type: OscillatorType }> = {
  beep1: { frequency: 880, duration: 0.15, type: 'sine' },      // A5 - suave
  beep2: { frequency: 1047, duration: 0.12, type: 'square' },   // C6 - mais agudo
  beep3: { frequency: 659, duration: 0.2, type: 'triangle' },   // E5 - médio
  beep4: { frequency: 1319, duration: 0.1, type: 'sine' },      // E6 - bem agudo
};

export function playNotifyBeep(beepKey: BeepKey, volume0to100: number): void {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const config = beepConfigs[beepKey] || beepConfigs.beep1;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = config.frequency;
    oscillator.type = config.type;

    // Volume: 0-100 -> 0-0.6
    const volume = (volume0to100 / 100) * 0.6;

    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + config.duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + config.duration);
  } catch (error) {
    console.warn('Não foi possível tocar som de notificação:', error);
  }
}

export const BEEP_OPTIONS: { value: BeepKey; label: string }[] = [
  { value: 'beep1', label: 'Beep 1 (Suave)' },
  { value: 'beep2', label: 'Beep 2 (Agudo)' },
  { value: 'beep3', label: 'Beep 3 (Médio)' },
  { value: 'beep4', label: 'Beep 4 (Rápido)' },
];

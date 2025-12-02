import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIdleTimerOptions {
  timeout: number; // em segundos
  onIdle: () => void;
  enabled?: boolean;
}

export const useIdleTimer = ({ timeout, onIdle, enabled = true }: UseIdleTimerOptions) => {
  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const idleMs = timeout * 1000;
    console.log('[useIdleTimer] idleSeconds:', timeout, '| idleMs:', idleMs);
    
    timeoutRef.current = setTimeout(() => {
      console.log('[useIdleTimer] Entrando em modo descanso');
      setIsIdle(true);
      onIdle();
    }, idleMs);
  }, [timeout, onIdle]);

  const resetTimer = useCallback(() => {
    if (!enabled || isIdle) return;
    startTimer();
  }, [enabled, isIdle, startTimer]);

  // Função chamada ao tocar na tela de descanso
  const dismissIdle = useCallback(() => {
    setIsIdle(false);
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    // Apenas eventos de toque/clique, ignorando mousemove e keydown
    const events = ['pointerdown', 'click', 'touchstart'];

    events.forEach(event => {
      document.addEventListener(event, resetTimer);
    });

    startTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [resetTimer, startTimer, enabled]);

  return { isIdle, dismissIdle };
};

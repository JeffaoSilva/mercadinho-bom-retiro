import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIdleTimerOptions {
  timeoutSeconds: number;
  onIdle: () => void;
  enabled?: boolean;
}

export const useIdleTimer = ({ timeoutSeconds, onIdle, enabled = true }: UseIdleTimerOptions) => {
  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onIdleRef = useRef(onIdle);

  // Manter referência atualizada do callback
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    
    const idleMs = timeoutSeconds * 1000;
    console.log('[useIdleTimer] timeoutSeconds:', timeoutSeconds, '| idleMs:', idleMs);
    
    timeoutRef.current = setTimeout(() => {
      console.log('[useIdleTimer] Idle timeout reached, calling onIdle');
      setIsIdle(true);
      onIdleRef.current();
    }, idleMs);
  }, [timeoutSeconds, clearTimer]);

  const resetTimer = useCallback(() => {
    if (!enabled || isIdle) return;
    startTimer();
  }, [enabled, isIdle, startTimer]);

  // Função chamada ao tocar na tela de descanso
  const dismissIdle = useCallback(() => {
    setIsIdle(false);
    startTimer();
  }, [startTimer]);

  // Reiniciar timer quando timeout mudar
  useEffect(() => {
    if (enabled && !isIdle) {
      startTimer();
    }
  }, [timeoutSeconds, enabled, isIdle, startTimer]);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }

    const events = ['click', 'touchstart', 'keydown', 'mousemove'];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    startTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      clearTimer();
    };
  }, [enabled, resetTimer, startTimer, clearTimer]);

  return { isIdle, dismissIdle };
};

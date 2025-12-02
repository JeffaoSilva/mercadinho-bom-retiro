import { useEffect, useRef, useState, useCallback } from 'react';

interface UseIdleTimerOptions {
  timeout: number; // em segundos
  onIdle: () => void;
  onActive?: () => void;
  enabled?: boolean;
}

export const useIdleTimer = ({ timeout, onIdle, onActive, enabled = true }: UseIdleTimerOptions) => {
  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (isIdle) {
      setIsIdle(false);
      onActive?.();
    }

    const idleMs = timeout * 1000;
    console.log('[useIdleTimer] idleSeconds:', timeout, '| idleMs:', idleMs);
    
    timeoutRef.current = setTimeout(() => {
      console.log('[useIdleTimer] Entrando em modo descanso');
      setIsIdle(true);
      onIdle();
    }, idleMs);
  }, [timeout, onIdle, onActive, isIdle, enabled]);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];

    events.forEach(event => {
      document.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [resetTimer, enabled]);

  return { isIdle, resetTimer };
};

import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useIdleTimer } from '@/hooks/useIdleTimer';

interface TelaDescansoConfig {
  id: number;
  ativa: boolean;
  imagem_url: string | null;
  titulo: string | null;
  subtitulo: string | null;
  cor_fundo: string | null;
}

export const TelaDescanso = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [config, setConfig] = useState<TelaDescansoConfig | null>(null);
  const [showScreen, setShowScreen] = useState(false);
  const [timeout, setTimeout] = useState(60);
  const [pointerEnabled, setPointerEnabled] = useState(true);
  const dismissingRef = useRef(false);

  // Carregar configuração do banco
  useEffect(() => {
    const loadConfig = async () => {
      const { data } = await supabase
        .from('tela_descanso')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data) {
        setConfig(data);
      }
    };

    loadConfig();

    // Carregar tempo de inatividade do localStorage (em segundos)
    const savedTimeout = localStorage.getItem('tela_descanso_timeout');
    const timeoutSeconds = savedTimeout ? parseInt(savedTimeout, 10) : 30;
    setTimeout(timeoutSeconds);

    // Subscribe to realtime updates
    const channel = supabase
      .channel('tela_descanso_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tela_descanso' }, (payload) => {
        if (payload.new) {
          setConfig(payload.new as TelaDescansoConfig);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Verificar se pode mostrar tela de descanso
  const canShowIdleScreen = () => {
    // Não mostra em rotas de compra ativa (cart, checkout)
    const purchaseRoutes = ['/cart', '/checkout'];
    if (purchaseRoutes.includes(location.pathname)) return false;
    
    // Não mostra se não está ativa
    if (!config?.ativa) return false;
    
    return true;
  };

  const handleIdle = () => {
    if (canShowIdleScreen()) {
      setShowScreen(true);
    }
  };

  const { dismissIdle } = useIdleTimer({
    timeout,
    onIdle: handleIdle,
    enabled: config?.ativa ?? false,
  });

  // Handler de captura para fechar - executa ANTES de propagar
  const handleDismissCapture = (e: React.PointerEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    
    setPointerEnabled(false);
    setShowScreen(false);
    dismissIdle();
    
    // Marcar globalmente que acabamos de fechar o descanso
    (window as any).__telaDescansoJustClosed = true;
    
    // Reabilitar interação após 300ms para evitar ghost click no mobile
    window.setTimeout(() => {
      setPointerEnabled(true);
      dismissingRef.current = false;
      // Limpar flag após um tempo extra
      window.setTimeout(() => {
        (window as any).__telaDescansoJustClosed = false;
      }, 100);
    }, 300);
    
    navigate('/');
  };

  if (!showScreen || !config) return null;

  return (
    <>
      {/* Overlay para bloquear interação com a tela de baixo */}
      {!pointerEnabled && (
        <div className="fixed inset-0 z-[9998]" style={{ pointerEvents: 'all' }} />
      )}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center cursor-pointer"
        onPointerDownCapture={handleDismissCapture}
        onTouchStartCapture={handleDismissCapture}
        style={{
          backgroundColor: config.cor_fundo || '#1a1a2e',
          pointerEvents: 'auto',
        }}
      >
      {config.imagem_url ? (
        <img
          src={config.imagem_url}
          alt="Tela de descanso"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="text-center p-8">
          {config.titulo && (
            <h1 className="text-6xl font-bold text-white mb-6">
              {config.titulo}
            </h1>
          )}
          {config.subtitulo && (
            <p className="text-3xl text-white/80">
              {config.subtitulo}
            </p>
          )}
        </div>
      )}
      
        <p className="absolute bottom-8 text-white/60 text-lg animate-pulse">
          Toque para continuar
        </p>
      </div>
    </>
  );
};

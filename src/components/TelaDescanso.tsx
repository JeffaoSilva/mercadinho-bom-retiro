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
  const [closing, setClosing] = useState(false);
  const [timeout, setTimeout] = useState(60);
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

  // Handler de captura para fechar - correção hard para mobile
  const handleDismissCapture = (e: React.PointerEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dismissingRef.current || closing) return;
    dismissingRef.current = true;
    
    // Iniciar fase de fechamento - overlay fica invisível mas ainda bloqueia
    setClosing(true);
    
    // Bloquear body inteiro por segurança extra
    document.body.style.pointerEvents = 'none';
    
    // Após 400ms, finalizar o fechamento
    window.setTimeout(() => {
      setShowScreen(false);
      setClosing(false);
      dismissingRef.current = false;
      dismissIdle();
      
      // Reativar body
      document.body.style.pointerEvents = 'auto';
      
      navigate('/');
    }, 400);
  };

  // Não renderiza nada se não está ativo
  if (!showScreen && !closing) return null;
  if (!config) return null;

  // Durante closing: overlay transparente que bloqueia toques
  if (closing) {
    return (
      <div
        className="fixed inset-0 z-[9999]"
        style={{
          pointerEvents: 'auto',
          background: 'transparent',
        }}
        onPointerDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onTouchStartCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      />
    );
  }

  return (
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
  );
};

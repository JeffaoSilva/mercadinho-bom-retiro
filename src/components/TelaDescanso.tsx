import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useIdleStore } from '@/stores/idleStore';
import { useTabletStore } from '@/stores/tabletStore';

interface TelaDescansoConfig {
  id: number;
  ativa: boolean;
  imagem_url: string | null;
  titulo: string | null;
  subtitulo: string | null;
  cor_fundo: string | null;
  tablet_id: number | null;
}

export const TelaDescanso = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [config, setConfig] = useState<TelaDescansoConfig | null>(null);
  const [showScreen, setShowScreen] = useState(false);
  const [closing, setClosing] = useState(false);
  const dismissingRef = useRef(false);

  const idleSeconds = useIdleStore((state) => state.idleSeconds);
  const tabletId = useTabletStore((state) => state.tabletId);

  // Carregar configuração do banco com prioridade: tablet > global
  useEffect(() => {
    const loadConfig = async () => {
      // Primeiro tenta buscar config específica do tablet
      if (tabletId) {
        const { data: tabletConfig } = await supabase
          .from('tela_descanso')
          .select('*')
          .eq('ativa', true)
          .eq('tablet_id', tabletId)
          .order('criado_em', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (tabletConfig) {
          setConfig(tabletConfig as TelaDescansoConfig);
          return;
        }
      }

      // Se não encontrou específica, busca global (tablet_id IS NULL)
      const { data: globalConfig } = await supabase
        .from('tela_descanso')
        .select('*')
        .eq('ativa', true)
        .is('tablet_id', null)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (globalConfig) {
        setConfig(globalConfig as TelaDescansoConfig);
      } else {
        setConfig(null);
      }
    };

    loadConfig();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('tela_descanso_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tela_descanso' }, () => {
        loadConfig();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tabletId]);

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
    timeoutSeconds: idleSeconds,
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

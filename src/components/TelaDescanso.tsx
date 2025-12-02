import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useCheckout } from '@/hooks/useCheckout';

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
  const { cart } = useCheckout();
  const [config, setConfig] = useState<TelaDescansoConfig | null>(null);
  const [showScreen, setShowScreen] = useState(false);
  const [timeout, setTimeout] = useState(60);

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
    // Só mostra na Home ou SelectClient
    const allowedRoutes = ['/', '/select-client'];
    if (!allowedRoutes.includes(location.pathname)) return false;
    
    // Não mostra se tem itens no carrinho (compra em andamento)
    if (cart.length > 0) return false;
    
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

  const handleDismiss = () => {
    setShowScreen(false);
    dismissIdle();
    navigate('/');
  };

  if (!showScreen || !config) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center cursor-pointer"
      onClick={handleDismiss}
      onTouchStart={handleDismiss}
      style={{
        backgroundColor: config.cor_fundo || '#1a1a2e',
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

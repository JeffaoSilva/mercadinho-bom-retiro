import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, Trash2, Image } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useIdleStore } from "@/stores/idleStore";

interface TelaDescansoConfig {
  id: number;
  ativa: boolean;
  imagem_url: string | null;
  titulo: string | null;
  subtitulo: string | null;
  cor_fundo: string | null;
  tablet_id: number | null;
}

interface Tablet {
  id: number;
  nome: string;
}

const AdminTelaDescanso = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setIdleSeconds = useIdleStore((state) => state.setIdleSeconds);
  const currentIdleSeconds = useIdleStore((state) => state.idleSeconds);
  
  const [config, setConfig] = useState<TelaDescansoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [idleSecondsInput, setIdleSecondsInput] = useState('30');
  const [idleError, setIdleError] = useState('');
  
  // Novo: escopo e tablets
  const [scope, setScope] = useState<'global' | 'tablet'>('global');
  const [selectedTabletId, setSelectedTabletId] = useState<number | null>(null);
  const [tablets, setTablets] = useState<Tablet[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadTablets();
    setIdleSecondsInput(currentIdleSeconds.toString());
  }, [isAuthenticated, authLoading, navigate, currentIdleSeconds]);

  useEffect(() => {
    loadConfig();
  }, [scope, selectedTabletId]);

  const loadTablets = async () => {
    const { data } = await supabase
      .from('tablets')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    
    if (data) {
      setTablets(data);
    }
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      let query = supabase.from('tela_descanso').select('*');
      
      if (scope === 'global') {
        query = query.is('tablet_id', null);
      } else if (selectedTabletId) {
        query = query.eq('tablet_id', selectedTabletId);
      } else {
        setConfig(null);
        setLoading(false);
        return;
      }

      const { data, error } = await query.order('criado_em', { ascending: false }).limit(1).maybeSingle();

      if (error) throw error;
      
      if (data) {
        setConfig(data as TelaDescansoConfig);
      } else {
        // Criar novo registro se não existir
        setConfig({
          id: 0,
          ativa: false,
          imagem_url: null,
          titulo: null,
          subtitulo: null,
          cor_fundo: '#1a1a2e',
          tablet_id: scope === 'tablet' ? selectedTabletId : null,
        });
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
      toast.error('Erro ao carregar configuração');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAtiva = async (ativa: boolean) => {
    if (!config) return;
    
    setSaving(true);
    try {
      if (config.id === 0) {
        // Criar novo registro
        const { data, error } = await supabase
          .from('tela_descanso')
          .insert({
            ativa,
            tablet_id: scope === 'tablet' ? selectedTabletId : null,
            titulo: config.titulo,
            subtitulo: config.subtitulo,
            cor_fundo: config.cor_fundo,
          })
          .select()
          .single();

        if (error) throw error;
        setConfig(data as TelaDescansoConfig);
      } else {
        const { error } = await supabase
          .from('tela_descanso')
          .update({ ativa })
          .eq('id', config.id);

        if (error) throw error;
        setConfig({ ...config, ativa });
      }
      
      toast.success(ativa ? 'Tela de descanso ativada' : 'Tela de descanso desativada');
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    
    // Validar tempo de inatividade
    const parsed = parseInt(idleSecondsInput, 10);
    if (!idleSecondsInput.trim() || isNaN(parsed) || parsed <= 0) {
      setIdleError('Digite um número inteiro maior que 0');
      return;
    }
    setIdleError('');
    
    setSaving(true);
    try {
      const payload = {
        titulo: config.titulo,
        subtitulo: config.subtitulo,
        cor_fundo: config.cor_fundo,
        ativa: config.ativa,
        tablet_id: scope === 'tablet' ? selectedTabletId : null,
      };

      if (config.id === 0) {
        // Criar novo registro
        const { data, error } = await supabase
          .from('tela_descanso')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        setConfig(data as TelaDescansoConfig);
      } else {
        const { error } = await supabase
          .from('tela_descanso')
          .update(payload)
          .eq('id', config.id);

        if (error) throw error;
      }
      
      // Atualizar store global - aplica na hora
      setIdleSeconds(parsed);
      
      toast.success('Configurações salvas');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !config) return;

    setUploading(true);
    try {
      // Deletar imagem anterior se existir
      if (config.imagem_url) {
        const oldPath = config.imagem_url.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('tela-descanso').remove([oldPath]);
        }
      }

      // Upload nova imagem
      const fileName = `tela_${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('tela-descanso')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from('tela-descanso')
        .getPublicUrl(fileName);

      // Atualizar banco
      if (config.id === 0) {
        const { data, error } = await supabase
          .from('tela_descanso')
          .insert({
            imagem_url: urlData.publicUrl,
            tablet_id: scope === 'tablet' ? selectedTabletId : null,
            ativa: config.ativa,
            titulo: config.titulo,
            subtitulo: config.subtitulo,
            cor_fundo: config.cor_fundo,
          })
          .select()
          .single();

        if (error) throw error;
        setConfig(data as TelaDescansoConfig);
      } else {
        const { error: updateError } = await supabase
          .from('tela_descanso')
          .update({ imagem_url: urlData.publicUrl })
          .eq('id', config.id);

        if (updateError) throw updateError;
        setConfig({ ...config, imagem_url: urlData.publicUrl });
      }
      
      toast.success('Imagem enviada com sucesso');
    } catch (error) {
      console.error('Erro ao enviar imagem:', error);
      toast.error('Erro ao enviar imagem');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!config?.imagem_url) return;

    setSaving(true);
    try {
      // Deletar do storage
      const oldPath = config.imagem_url.split('/').pop();
      if (oldPath) {
        await supabase.storage.from('tela-descanso').remove([oldPath]);
      }

      // Atualizar banco
      const { error } = await supabase
        .from('tela_descanso')
        .update({ imagem_url: null })
        .eq('id', config.id);

      if (error) throw error;

      setConfig({ ...config, imagem_url: null });
      toast.success('Imagem removida');
    } catch (error) {
      console.error('Erro ao remover imagem:', error);
      toast.error('Erro ao remover imagem');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Tela de Descanso</h1>
        </div>

        <div className="bg-card rounded-lg p-6 space-y-6 border">
          {/* Seletor de escopo */}
          <div className="space-y-2">
            <Label>Escopo da configuração</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as 'global' | 'tablet')}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o escopo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (todos os tablets)</SelectItem>
                <SelectItem value="tablet">Somente um tablet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Seletor de tablet específico */}
          {scope === 'tablet' && (
            <div className="space-y-2">
              <Label>Tablet</Label>
              <Select 
                value={selectedTabletId?.toString() ?? ''} 
                onValueChange={(v) => setSelectedTabletId(v ? parseInt(v, 10) : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um tablet" />
                </SelectTrigger>
                <SelectContent>
                  {tablets.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tablets.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum tablet cadastrado</p>
              )}
            </div>
          )}

          {/* Toggle Ativa */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-lg font-medium">Ativar tela de descanso</Label>
              <p className="text-sm text-muted-foreground">
                Exibe uma tela após período de inatividade
              </p>
            </div>
            <Switch
              checked={config?.ativa ?? false}
              onCheckedChange={handleToggleAtiva}
              disabled={saving || (scope === 'tablet' && !selectedTabletId)}
            />
          </div>

          {/* Tempo de inatividade */}
          <div className="space-y-2">
            <Label>Tempo de inatividade (segundos)</Label>
            <Input
              type="text"
              value={idleSecondsInput}
              onChange={(e) => {
                setIdleSecondsInput(e.target.value);
                setIdleError('');
              }}
              placeholder="30"
            />
            {idleError && (
              <p className="text-xs text-destructive">{idleError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Tempo sem interação antes de mostrar a tela (aplica imediatamente)
            </p>
          </div>

          {/* Upload de imagem */}
          <div className="space-y-3">
            <Label>Imagem de fundo</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            
            {config?.imagem_url ? (
              <div className="space-y-3">
                <img
                  src={config.imagem_url}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-lg border"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Trocar imagem
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleRemoveImage}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remover
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || (scope === 'tablet' && !selectedTabletId)}
                className="w-full h-32 border-dashed"
              >
                <div className="flex flex-col items-center gap-2">
                  <Image className="h-8 w-8 text-muted-foreground" />
                  <span>{uploading ? 'Enviando...' : 'Clique para enviar imagem'}</span>
                </div>
              </Button>
            )}
          </div>

          {/* Título */}
          <div className="space-y-2">
            <Label>Título (se sem imagem)</Label>
            <Input
              value={config?.titulo ?? ''}
              onChange={(e) => setConfig(config ? { ...config, titulo: e.target.value } : null)}
              placeholder="Ex: Bem-vindo ao Mercadinho"
            />
          </div>

          {/* Subtítulo */}
          <div className="space-y-2">
            <Label>Subtítulo (se sem imagem)</Label>
            <Input
              value={config?.subtitulo ?? ''}
              onChange={(e) => setConfig(config ? { ...config, subtitulo: e.target.value } : null)}
              placeholder="Ex: Toque para iniciar"
            />
          </div>

          {/* Cor de fundo */}
          <div className="space-y-2">
            <Label>Cor de fundo (se sem imagem)</Label>
            <div className="flex gap-3 items-center">
              <input
                type="color"
                value={config?.cor_fundo ?? '#1a1a2e'}
                onChange={(e) => setConfig(config ? { ...config, cor_fundo: e.target.value } : null)}
                className="w-12 h-12 rounded cursor-pointer"
              />
              <Input
                value={config?.cor_fundo ?? '#1a1a2e'}
                onChange={(e) => setConfig(config ? { ...config, cor_fundo: e.target.value } : null)}
                placeholder="#1a1a2e"
                className="flex-1"
              />
            </div>
          </div>

          <Button 
            onClick={handleSave} 
            disabled={saving || (scope === 'tablet' && !selectedTabletId)} 
            className="w-full"
          >
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </Button>
        </div>

        {/* Preview */}
        <div className="bg-card rounded-lg p-4 border">
          <Label className="mb-3 block">Preview</Label>
          <div
            className="w-full h-48 rounded-lg flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: config?.cor_fundo ?? '#1a1a2e' }}
          >
            {config?.imagem_url ? (
              <img
                src={config.imagem_url}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center p-4">
                {config?.titulo && (
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {config.titulo}
                  </h2>
                )}
                {config?.subtitulo && (
                  <p className="text-white/80">{config.subtitulo}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminTelaDescanso;

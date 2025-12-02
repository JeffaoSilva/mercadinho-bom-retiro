import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Upload, Trash2, Image } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/hooks/useAdmin";

interface TelaDescansoConfig {
  id: number;
  ativa: boolean;
  imagem_url: string | null;
  titulo: string | null;
  subtitulo: string | null;
  cor_fundo: string | null;
}

const AdminTelaDescanso = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAdmin();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [config, setConfig] = useState<TelaDescansoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [idleSecondsInput, setIdleSecondsInput] = useState('30');
  const [idleError, setIdleError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadConfig();
    
    // Carregar timeout do localStorage
    const savedTimeout = localStorage.getItem('tela_descanso_timeout');
    setIdleSecondsInput(savedTimeout ?? '30');
  }, [isAuthenticated, navigate]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('tela_descanso')
        .select('*')
        .limit(1)
        .single();

      if (error) throw error;
      setConfig(data);
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
      const { error } = await supabase
        .from('tela_descanso')
        .update({ ativa })
        .eq('id', config.id);

      if (error) throw error;
      
      setConfig({ ...config, ativa });
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
      const { error } = await supabase
        .from('tela_descanso')
        .update({
          titulo: config.titulo,
          subtitulo: config.subtitulo,
          cor_fundo: config.cor_fundo,
        })
        .eq('id', config.id);

      if (error) throw error;
      
      // Salvar timeout no localStorage como número
      localStorage.setItem('tela_descanso_timeout', parsed.toString());
      
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
      const { error: updateError } = await supabase
        .from('tela_descanso')
        .update({ imagem_url: urlData.publicUrl })
        .eq('id', config.id);

      if (updateError) throw updateError;

      setConfig({ ...config, imagem_url: urlData.publicUrl });
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
              disabled={saving}
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
              Tempo sem interação antes de mostrar a tela (salvo localmente)
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
                disabled={uploading}
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

          <Button onClick={handleSave} disabled={saving} className="w-full">
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

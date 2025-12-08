import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";

interface ConfigSistema {
  dia_limite_padrao: number;
  bip_ativo: boolean;
  bip_volume: number;
}

interface ConfigMensal {
  mes_referencia: string;
  dia_limite: number;
}

const AdminConfiguracoes = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();
  
  const [configSistema, setConfigSistema] = useState<ConfigSistema>({
    dia_limite_padrao: 5,
    bip_ativo: true,
    bip_volume: 70,
  });
  const [configMensais, setConfigMensais] = useState<ConfigMensal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Modal para adicionar/editar config mensal
  const [showModal, setShowModal] = useState(false);
  const [editingMes, setEditingMes] = useState<string | null>(null);
  const [formMes, setFormMes] = useState({ mes_referencia: "", dia_limite: 5 });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadData();
  }, [isAuthenticated, authLoading, navigate]);

  const loadData = async () => {
    setLoading(true);
    
    // Carregar config_sistema (tabela nova, usar type assertion)
    const { data: sistema } = await supabase
      .from("config_sistema" as any)
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    
    if (sistema) {
      const s = sistema as any;
      setConfigSistema({
        dia_limite_padrao: s.dia_limite_padrao,
        bip_ativo: s.bip_ativo,
        bip_volume: s.bip_volume,
      });
    }
    
    // Carregar config_pagamentos_mensais (tabela nova, usar type assertion)
    const { data: mensais } = await supabase
      .from("config_pagamentos_mensais" as any)
      .select("*")
      .order("mes_referencia", { ascending: false });
    
    setConfigMensais((mensais || []) as unknown as ConfigMensal[]);
    setLoading(false);
  };

  const salvarConfigSistema = async () => {
    setSaving(true);
    
    const { error } = await supabase
      .from("config_sistema" as any)
      .upsert({
        id: 1,
        dia_limite_padrao: configSistema.dia_limite_padrao,
        bip_ativo: configSistema.bip_ativo,
        bip_volume: configSistema.bip_volume,
      });
    
    setSaving(false);
    
    if (error) {
      toast.error("Erro ao salvar configurações");
    } else {
      toast.success("Configurações salvas!");
    }
  };

  const abrirModalNovo = () => {
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    setFormMes({ mes_referencia: mesAtual, dia_limite: configSistema.dia_limite_padrao });
    setEditingMes(null);
    setShowModal(true);
  };

  const abrirModalEditar = (config: ConfigMensal) => {
    setFormMes({ mes_referencia: config.mes_referencia, dia_limite: config.dia_limite });
    setEditingMes(config.mes_referencia);
    setShowModal(true);
  };

  const salvarConfigMensal = async () => {
    if (!formMes.mes_referencia) {
      toast.error("Informe o mês de referência");
      return;
    }
    
    const { error } = await supabase
      .from("config_pagamentos_mensais" as any)
      .upsert({
        mes_referencia: formMes.mes_referencia,
        dia_limite: formMes.dia_limite,
      });
    
    if (error) {
      toast.error("Erro ao salvar configuração mensal");
    } else {
      toast.success("Configuração mensal salva!");
      setShowModal(false);
      loadData();
    }
  };

  const excluirConfigMensal = async (mes: string) => {
    const { error } = await supabase
      .from("config_pagamentos_mensais" as any)
      .delete()
      .eq("mes_referencia", mes);
    
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Configuração excluída");
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold">Configurações</h1>
        </div>

        {/* Configurações Gerais */}
        <Card>
          <CardHeader>
            <CardTitle>Configurações Gerais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Dia limite padrão para pagamento (1-28)</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={configSistema.dia_limite_padrao}
                onChange={(e) => setConfigSistema({
                  ...configSistema,
                  dia_limite_padrao: Math.min(28, Math.max(1, parseInt(e.target.value) || 5))
                })}
                className="w-32"
              />
              <p className="text-sm text-muted-foreground">
                Até este dia do mês, a fatura do mês anterior pode ser paga sem constar como atrasada.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Som de beep ao escanear</Label>
                <p className="text-sm text-muted-foreground">Ativa/desativa o som ao ler código de barras</p>
              </div>
              <Switch
                checked={configSistema.bip_ativo}
                onCheckedChange={(checked) => setConfigSistema({ ...configSistema, bip_ativo: checked })}
              />
            </div>

            {configSistema.bip_ativo && (
              <div className="space-y-2">
                <Label>Volume do beep: {configSistema.bip_volume}%</Label>
                <Slider
                  value={[configSistema.bip_volume]}
                  onValueChange={(v) => setConfigSistema({ ...configSistema, bip_volume: v[0] })}
                  min={0}
                  max={100}
                  step={5}
                  className="w-64"
                />
              </div>
            )}

            <Button onClick={salvarConfigSistema} disabled={saving}>
              {saving ? "Salvando..." : "Salvar Configurações Gerais"}
            </Button>
          </CardContent>
        </Card>

        {/* Configuração por Mês */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Dia Limite por Mês</CardTitle>
            <Button onClick={abrirModalNovo} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Configure um dia limite específico para determinados meses. Se não houver configuração para um mês, será usado o valor padrão ({configSistema.dia_limite_padrao}).
            </p>
            
            {configMensais.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhuma configuração específica por mês.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead>Dia Limite</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configMensais.map((config) => (
                    <TableRow key={config.mes_referencia}>
                      <TableCell className="font-medium">{config.mes_referencia}</TableCell>
                      <TableCell>Dia {config.dia_limite}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => abrirModalEditar(config)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => excluirConfigMensal(config.mes_referencia)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Adicionar/Editar Config Mensal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMes ? "Editar Configuração" : "Nova Configuração por Mês"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mês de Referência</Label>
              <Input
                type="month"
                value={formMes.mes_referencia}
                onChange={(e) => setFormMes({ ...formMes, mes_referencia: e.target.value })}
                disabled={!!editingMes}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Dia Limite (1-28)</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={formMes.dia_limite}
                onChange={(e) => setFormMes({
                  ...formMes,
                  dia_limite: Math.min(28, Math.max(1, parseInt(e.target.value) || 5))
                })}
                className="w-32"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={salvarConfigMensal}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminConfiguracoes;

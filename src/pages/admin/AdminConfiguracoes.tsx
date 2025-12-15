import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2, CalendarIcon, Monitor, Volume2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { cn } from "@/lib/utils";
import { playNotifyBeep, BEEP_OPTIONS } from "@/utils/notifySounds";

interface ConfigSistema {
  bip_ativo: boolean;
  bip_volume: number;
}

interface ConfigNotif {
  notif_venda_popup_ativo: boolean;
  notif_venda_som_ativo: boolean;
  notif_venda_som_volume: number;
  notif_venda_som_br: string;
  notif_venda_som_sf: string;
}

interface ConfigMensal {
  mes_referencia: string;
  data_limite: string | null;
}

const AdminConfiguracoes = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();

  const [configSistema, setConfigSistema] = useState<ConfigSistema>({
    bip_ativo: true,
    bip_volume: 70,
  });
  const [configNotif, setConfigNotif] = useState<ConfigNotif>({
    notif_venda_popup_ativo: true,
    notif_venda_som_ativo: true,
    notif_venda_som_volume: 70,
    notif_venda_som_br: 'beep1',
    notif_venda_som_sf: 'beep2',
  });
  const [configMensais, setConfigMensais] = useState<ConfigMensal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);

  // Modal para adicionar/editar config mensal
  const [showModal, setShowModal] = useState(false);
  const [editingMes, setEditingMes] = useState<string | null>(null);
  const [formMes, setFormMes] = useState({ mes_referencia: "", data_limite: null as Date | null });

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

    // Carregar config_sistema (som + notificações)
    const { data: sistema } = await supabase
      .from("config_sistema")
      .select(`
        bip_ativo, bip_volume,
        notif_venda_popup_ativo, notif_venda_som_ativo, notif_venda_som_volume,
        notif_venda_som_br, notif_venda_som_sf
      `)
      .eq("id", 1)
      .maybeSingle();

    if (sistema) {
      setConfigSistema({
        bip_ativo: sistema.bip_ativo,
        bip_volume: sistema.bip_volume,
      });
      setConfigNotif({
        notif_venda_popup_ativo: sistema.notif_venda_popup_ativo,
        notif_venda_som_ativo: sistema.notif_venda_som_ativo,
        notif_venda_som_volume: sistema.notif_venda_som_volume,
        notif_venda_som_br: sistema.notif_venda_som_br,
        notif_venda_som_sf: sistema.notif_venda_som_sf,
      });
    }

    // Carregar config_pagamentos_mensais
    const { data: mensais } = await supabase
      .from("config_pagamentos_mensais")
      .select("mes_referencia, data_limite")
      .order("mes_referencia", { ascending: false });

    setConfigMensais((mensais || []) as ConfigMensal[]);

    setLoading(false);
  };

  const salvarConfigSistema = async () => {
    setSaving(true);

    const { error } = await supabase
      .from("config_sistema")
      .upsert({
        id: 1,
        bip_ativo: configSistema.bip_ativo,
        bip_volume: configSistema.bip_volume,
      } as any);

    setSaving(false);

    if (error) {
      toast.error("Erro ao salvar configurações");
    } else {
      toast.success("Configurações de som salvas!");
    }
  };

  const salvarConfigNotif = async () => {
    setSavingNotif(true);

    const { error } = await supabase
      .from("config_sistema")
      .upsert({
        id: 1,
        notif_venda_popup_ativo: configNotif.notif_venda_popup_ativo,
        notif_venda_som_ativo: configNotif.notif_venda_som_ativo,
        notif_venda_som_volume: configNotif.notif_venda_som_volume,
        notif_venda_som_br: configNotif.notif_venda_som_br,
        notif_venda_som_sf: configNotif.notif_venda_som_sf,
      } as any);

    setSavingNotif(false);

    if (error) {
      toast.error("Erro ao salvar configurações");
    } else {
      toast.success("Configurações de notificação salvas!");
    }
  };

  const testarSom = (beepKey: string) => {
    playNotifyBeep(
      beepKey as "beep1" | "beep2" | "beep3" | "beep4",
      configNotif.notif_venda_som_volume
    );
  };

  const gerarMesesDisponiveis = () => {
    const meses: string[] = [];
    const hoje = new Date();
    // Gera 12 meses: 2 anteriores + atual + 9 futuros
    for (let i = -2; i <= 9; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return meses;
  };

  const abrirModalNovo = () => {
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    setFormMes({ mes_referencia: mesAtual, data_limite: null });
    setEditingMes(null);
    setShowModal(true);
  };

  const abrirModalEditar = (config: ConfigMensal) => {
    setFormMes({
      mes_referencia: config.mes_referencia,
      data_limite: config.data_limite ? new Date(config.data_limite + "T00:00:00") : null,
    });
    setEditingMes(config.mes_referencia);
    setShowModal(true);
  };

  const salvarConfigMensal = async () => {
    if (!formMes.mes_referencia) {
      toast.error("Informe o mês de referência");
      return;
    }

    const dataLimiteStr = formMes.data_limite
      ? format(formMes.data_limite, "yyyy-MM-dd")
      : null;

    const { error } = await supabase
      .from("config_pagamentos_mensais")
      .upsert({
        mes_referencia: formMes.mes_referencia,
        data_limite: dataLimiteStr,
      } as any);

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
      .from("config_pagamentos_mensais")
      .delete()
      .eq("mes_referencia", mes);

    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Configuração excluída");
      loadData();
    }
  };

  const formatarMesReferencia = (mes: string) => {
    const [ano, m] = mes.split("-");
    const nomesMes = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    return `${nomesMes[parseInt(m) - 1]} ${ano}`;
  };

  const formatarDataLimite = (data: string | null) => {
    if (!data) return "Não definida";
    const [ano, mes, dia] = data.split("-");
    return `${dia}/${mes}/${ano}`;
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

        {/* Configurações de Som */}
        <Card>
          <CardHeader>
            <CardTitle>Configurações de Som</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
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
              {saving ? "Salvando..." : "Salvar Configurações de Som"}
            </Button>
          </CardContent>
        </Card>

        {/* Notificações de Venda */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Notificações de Venda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Popup de venda (visual)</Label>
                <p className="text-sm text-muted-foreground">Exibe notificação visual ao receber nova venda</p>
              </div>
              <Switch
                checked={configNotif.notif_venda_popup_ativo}
                onCheckedChange={(checked) =>
                  setConfigNotif({ ...configNotif, notif_venda_popup_ativo: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Som de venda</Label>
                <p className="text-sm text-muted-foreground">Toca um som ao receber nova venda</p>
              </div>
              <Switch
                checked={configNotif.notif_venda_som_ativo}
                onCheckedChange={(checked) =>
                  setConfigNotif({ ...configNotif, notif_venda_som_ativo: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Volume do som das notificações: {configNotif.notif_venda_som_volume}%</Label>
              <Slider
                value={[configNotif.notif_venda_som_volume]}
                onValueChange={(v) =>
                  setConfigNotif({ ...configNotif, notif_venda_som_volume: v[0] })
                }
                min={0}
                max={100}
                step={5}
                className="w-64"
                disabled={!configNotif.notif_venda_som_ativo}
              />
            </div>

            <div className="space-y-4 pt-4 border-t">
              <Label className="text-base font-semibold">Som por Mercadinho</Label>
              
              {/* Bom Retiro */}
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <Label>Bom Retiro</Label>
                  <Select
                    value={configNotif.notif_venda_som_br}
                    onValueChange={(v) =>
                      setConfigNotif({ ...configNotif, notif_venda_som_br: v })
                    }
                    disabled={!configNotif.notif_venda_som_ativo}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BEEP_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testarSom(configNotif.notif_venda_som_br)}
                  disabled={!configNotif.notif_venda_som_ativo}
                >
                  Testar
                </Button>
              </div>

              {/* São Francisco */}
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <Label>São Francisco</Label>
                  <Select
                    value={configNotif.notif_venda_som_sf}
                    onValueChange={(v) =>
                      setConfigNotif({ ...configNotif, notif_venda_som_sf: v })
                    }
                    disabled={!configNotif.notif_venda_som_ativo}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BEEP_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testarSom(configNotif.notif_venda_som_sf)}
                  disabled={!configNotif.notif_venda_som_ativo}
                >
                  Testar
                </Button>
              </div>
            </div>

            <Button onClick={salvarConfigNotif} disabled={savingNotif}>
              {savingNotif ? "Salvando..." : "Salvar Configurações de Notificação"}
            </Button>
          </CardContent>
        </Card>

        {/* Data Limite de Pagamento por Mês */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Data Limite de Pagamento por Mês</CardTitle>
            <Button onClick={abrirModalNovo} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Configure a data limite para pagamento de cada mês. Se um mês não tiver configuração, o botão de fatura aparecerá sem data limite.
            </p>

            {configMensais.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhuma configuração de data limite por mês.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês de Referência</TableHead>
                    <TableHead>Data Limite</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configMensais.map((config) => (
                    <TableRow key={config.mes_referencia}>
                      <TableCell className="font-medium">{formatarMesReferencia(config.mes_referencia)}</TableCell>
                      <TableCell>{formatarDataLimite(config.data_limite)}</TableCell>
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

        {/* Tela de Descanso */}
        <Card>
          <CardHeader>
            <CardTitle>Tela de Descanso</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Configure a tela exibida durante inatividade nos tablets. Personalize imagem, texto e cores.
            </p>
            <Button onClick={() => navigate("/admin/tela-descanso")} variant="outline">
              <Monitor className="h-4 w-4 mr-2" />
              Abrir configurações da Tela de Descanso
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Modal Adicionar/Editar Config Mensal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMes ? "Editar Data Limite" : "Nova Data Limite por Mês"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mês de Referência</Label>
              <Select
                value={formMes.mes_referencia}
                onValueChange={(v) => setFormMes({ ...formMes, mes_referencia: v })}
                disabled={!!editingMes}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o mês" />
                </SelectTrigger>
                <SelectContent>
                  {gerarMesesDisponiveis().map((mes) => (
                    <SelectItem key={mes} value={mes}>
                      {formatarMesReferencia(mes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Este é o mês das compras. A data limite será para pagamento no mês seguinte.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Data Limite para Pagamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formMes.data_limite && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formMes.data_limite
                      ? format(formMes.data_limite, "dd/MM/yyyy", { locale: ptBR })
                      : "Selecione a data limite"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formMes.data_limite || undefined}
                    onSelect={(date) => setFormMes({ ...formMes, data_limite: date || null })}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Até esta data, a fatura aparece como "para pagar". Após, aparece como "atrasada".
              </p>
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

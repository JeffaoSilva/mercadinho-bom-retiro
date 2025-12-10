import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, Plus, Pencil, Trash2, CalendarIcon, Copy, Check, Camera } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { cn } from "@/lib/utils";
import {
  CodigoTres,
  listarCodigosTres,
  adicionarCodigoTres,
  marcarCodigoUsado,
} from "@/services/codigosTres";
import CameraOCR from "@/components/CameraOCR";

interface ConfigSistema {
  bip_ativo: boolean;
  bip_volume: number;
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
  const [configMensais, setConfigMensais] = useState<ConfigMensal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal para adicionar/editar config mensal
  const [showModal, setShowModal] = useState(false);
  const [editingMes, setEditingMes] = useState<string | null>(null);
  const [formMes, setFormMes] = useState({ mes_referencia: "", data_limite: null as Date | null });

  // Códigos Três
  const [codigosTres, setCodigosTres] = useState<CodigoTres[]>([]);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [adicionandoCodigo, setAdicionandoCodigo] = useState(false);
  const [showCameraOCR, setShowCameraOCR] = useState(false);

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

    // Carregar config_sistema
    const { data: sistema } = await supabase
      .from("config_sistema")
      .select("bip_ativo, bip_volume")
      .eq("id", 1)
      .maybeSingle();

    if (sistema) {
      setConfigSistema({
        bip_ativo: sistema.bip_ativo,
        bip_volume: sistema.bip_volume,
      });
    }

    // Carregar config_pagamentos_mensais
    const { data: mensais } = await supabase
      .from("config_pagamentos_mensais")
      .select("mes_referencia, data_limite")
      .order("mes_referencia", { ascending: false });

    setConfigMensais((mensais || []) as ConfigMensal[]);

    // Carregar códigos três
    try {
      const codigos = await listarCodigosTres();
      setCodigosTres(codigos);
    } catch (err) {
      console.error("Erro ao carregar códigos três:", err);
    }

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
      toast.success("Configurações salvas!");
    }
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

  // Códigos Três
  const handleAdicionarCodigo = async () => {
    const codigo = novoCodigo.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!codigo) {
      toast.error("Informe um código válido");
      return;
    }

    setAdicionandoCodigo(true);
    try {
      const novo = await adicionarCodigoTres(codigo);
      setCodigosTres((prev) => [novo, ...prev]);
      setNovoCodigo("");
      toast.success("Código adicionado!");
    } catch (err) {
      toast.error("Erro ao adicionar código");
    } finally {
      setAdicionandoCodigo(false);
    }
  };

  const handleMarcarUsado = async (id: number) => {
    try {
      await marcarCodigoUsado(id);
      setCodigosTres((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, usado: true, usado_em: new Date().toISOString() } : c
        )
      );
      toast.success("Código marcado como usado");
    } catch (err) {
      toast.error("Erro ao marcar como usado");
    }
  };

  const handleCopiar = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success("Código copiado!");
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = codigo;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      toast.success("Código copiado!");
    }
  };

  const handleOCRResult = (text: string) => {
    setNovoCodigo(text);
    setShowCameraOCR(false);
    toast.success("Código lido com sucesso!");
  };

  const codigosPendentes = codigosTres.filter((c) => !c.usado);
  const codigosUsados = codigosTres.filter((c) => c.usado);

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

        {/* Códigos Três */}
        <Card>
          <CardHeader>
            <CardTitle>Códigos Três</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Input para adicionar */}
            <div className="flex gap-2">
              <Input
                placeholder="Digite o código"
                value={novoCodigo}
                onChange={(e) => setNovoCodigo(e.target.value.toUpperCase())}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleAdicionarCodigo()}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowCameraOCR(true)}
                title="Ler pela câmera"
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Button onClick={handleAdicionarCodigo} disabled={adicionandoCodigo}>
                {adicionandoCodigo ? "Adicionando..." : "Adicionar código"}
              </Button>
            </div>

            {/* Lista de pendentes */}
            <div>
              <h3 className="font-semibold mb-2">Códigos pendentes</h3>
              {codigosPendentes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum código pendente.</p>
              ) : (
                <div className="space-y-2">
                  {codigosPendentes.map((codigo, index) => (
                    <div
                      key={codigo.id}
                      className="flex items-center justify-between bg-muted p-3 rounded-lg"
                    >
                      <span className="font-mono">
                        {index + 1} - {codigo.codigo}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopiar(codigo.codigo)}
                          title="Copiar"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarcarUsado(codigo.id)}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Marcar como usado
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lista de utilizados */}
            {codigosUsados.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Códigos utilizados</h3>
                <div className="bg-muted/50 p-4 rounded-lg space-y-1">
                  {codigosUsados.map((codigo, index) => (
                    <p key={codigo.id} className="font-mono text-sm text-muted-foreground">
                      {index + 1} - {codigo.codigo}
                    </p>
                  ))}
                </div>
              </div>
            )}
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

      {/* Camera OCR */}
      {showCameraOCR && (
        <CameraOCR
          onResult={handleOCRResult}
          onClose={() => setShowCameraOCR(false)}
        />
      )}
    </div>
  );
};

export default AdminConfiguracoes;

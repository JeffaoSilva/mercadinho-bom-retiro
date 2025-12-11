import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Camera, Copy, Check, Trash2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import {
  CodigoTres,
  listarCodigosTres,
  adicionarCodigoTres,
  marcarCodigoUsado,
  removerCodigoTres,
} from "@/services/codigosTres";
import CameraOCR from "@/components/CameraOCR";

const AdminCodigosTres = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAdminAuth();

  const [codigosTres, setCodigosTres] = useState<CodigoTres[]>([]);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [adicionandoCodigo, setAdicionandoCodigo] = useState(false);
  const [showCameraOCR, setShowCameraOCR] = useState(false);
  const [loading, setLoading] = useState(true);
  const [codigoParaExcluir, setCodigoParaExcluir] = useState<CodigoTres | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate("/admin");
      return;
    }
    loadCodigos();
  }, [isAuthenticated, authLoading, navigate]);

  const loadCodigos = async () => {
    setLoading(true);
    try {
      const codigos = await listarCodigosTres();
      setCodigosTres(codigos);
    } catch (err) {
      console.error("Erro ao carregar códigos três:", err);
      toast.error("Erro ao carregar códigos");
    } finally {
      setLoading(false);
    }
  };

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

  const handleExcluir = async () => {
    if (!codigoParaExcluir) return;

    try {
      await removerCodigoTres(codigoParaExcluir.id);
      setCodigosTres((prev) => prev.filter((c) => c.id !== codigoParaExcluir.id));
      toast.success("Código removido!");
    } catch (err) {
      toast.error("Erro ao remover código");
    } finally {
      setCodigoParaExcluir(null);
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

  const codigosDisponiveis = codigosTres.filter((c) => !c.usado);
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
          <h1 className="text-3xl font-bold">Códigos Três</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Gerenciar Códigos</CardTitle>
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

            {/* Lista de disponíveis */}
            <div>
              <h3 className="font-semibold mb-2">Códigos disponíveis</h3>
              {codigosDisponiveis.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum código disponível.</p>
              ) : (
                <div className="space-y-2">
                  {codigosDisponiveis.map((codigo, index) => (
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCodigoParaExcluir(codigo)}
                          title="Apagar"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Camera OCR */}
      {showCameraOCR && (
        <CameraOCR
          onResult={handleOCRResult}
          onClose={() => setShowCameraOCR(false)}
        />
      )}

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!codigoParaExcluir} onOpenChange={() => setCodigoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar código?</AlertDialogTitle>
            <AlertDialogDescription>
              O código <strong className="font-mono">{codigoParaExcluir?.codigo}</strong> será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCodigosTres;

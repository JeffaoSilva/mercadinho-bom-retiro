import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { X, Camera, AlertTriangle } from "lucide-react";
import { playBeep } from "@/utils/beep";

interface CameraScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
  title?: string;
}

const CameraScanner = ({
  onDetected,
  onClose,
  title = "Aponte para o código de barras",
}: CameraScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);

  // Debounce para evitar bip duplo
  const lastCodeRef = useRef<string | null>(null);
  const lastReadAtRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      try {
        const reader = new BrowserMultiFormatReader();

        // Buscar dispositivos de vídeo
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();

        if (devices.length === 0) {
          setError("Nenhuma câmera encontrada");
          setIsStarting(false);
          return;
        }

        // Preferir câmera traseira
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("traseira") ||
            d.label.toLowerCase().includes("rear")
        );

        const deviceId = backCamera?.deviceId || devices[0].deviceId;

        if (!videoRef.current || !mounted) return;

        // Iniciar leitura contínua - retorna IScannerControls
        const controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result, err) => {
            if (!mounted) return;

            if (result) {
              const code = result.getText();
              if (code) {
                const normalized = code.trim();
                const now = Date.now();

                // Debounce: ignorar se mesmo código dentro de 1200ms
                if (
                  lastCodeRef.current === normalized &&
                  now - lastReadAtRef.current < 1200
                ) {
                  return;
                }

                lastCodeRef.current = normalized;
                lastReadAtRef.current = now;

                playBeep();
                // Parar scanner antes de chamar callback
                if (controlsRef.current) {
                  controlsRef.current.stop();
                }
                onDetected(normalized);
              }
            }

            // Ignorar erros de "não encontrado" - são normais durante scan
            if (err && err.name !== "NotFoundException") {
              console.warn("Erro durante scan:", err);
            }
          }
        );

        controlsRef.current = controls;

        if (mounted) {
          setIsStarting(false);
        }
      } catch (err: any) {
        console.error("Erro ao iniciar câmera:", err);
        if (mounted) {
          if (err.name === "NotAllowedError") {
            setError("Permissão de câmera negada. Permita o acesso nas configurações do navegador.");
          } else if (err.name === "NotFoundError") {
            setError("Nenhuma câmera encontrada no dispositivo.");
          } else {
            setError("Erro ao acessar câmera: " + (err.message || "desconhecido"));
          }
          setIsStarting(false);
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
    };
  }, [onDetected]);

  const handleClose = () => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Header */}
      <div className="bg-black/80 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-white">
          <Camera className="w-6 h-6" />
          <span className="font-medium">{title}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="text-white hover:bg-white/20"
        >
          <X className="w-6 h-6" />
        </Button>
      </div>

      {/* Video Area */}
      <div className="flex-1 relative flex items-center justify-center">
        {error ? (
          <div className="text-center p-8 text-white">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
            <p className="text-lg mb-4">{error}</p>
            <Button onClick={handleClose} variant="secondary">
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            
            {/* Overlay com guia de alinhamento */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Área de scan destacada */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 max-w-md h-32 border-2 border-primary rounded-lg">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
              </div>
            </div>

            {isStarting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-white text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2" />
                  <p>Iniciando câmera...</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="bg-black/80 p-4 text-center">
        <Button onClick={handleClose} variant="outline" className="w-full max-w-xs">
          Cancelar
        </Button>
      </div>
    </div>
  );
};

export default CameraScanner;

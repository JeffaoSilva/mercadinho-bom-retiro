import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Camera, Loader2 } from "lucide-react";
import Tesseract from "tesseract.js";

interface CameraOCRProps {
  onResult: (text: string) => void;
  onClose: () => void;
}

const CameraOCR = ({ onResult, onClose }: CameraOCRProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        setIsStarting(false);
      } catch (err: any) {
        if (mounted) {
          if (err.name === "NotAllowedError") {
            setError("Permissão de câmera negada.");
          } else {
            setError("Erro ao acessar câmera.");
          }
          setIsStarting(false);
        }
      }
    };

    startCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setIsProcessing(false);
      return;
    }

    ctx.drawImage(video, 0, 0);

    try {
      const { data } = await Tesseract.recognize(canvas, "eng", {
        logger: () => {},
      });

      // Normalizar: apenas A-Z e 0-9, maiúsculas
      const normalized = data.text
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

      if (normalized.length === 0) {
        setError("Não consegui ler, tente de novo.");
        setIsProcessing(false);
        return;
      }

      // Parar câmera e retornar resultado
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      onResult(normalized);
    } catch (err) {
      console.error("Erro OCR:", err);
      setError("Erro ao processar imagem.");
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Header */}
      <div className="bg-black/80 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-white">
          <Camera className="w-6 h-6" />
          <span className="font-medium">Ler código por câmera</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="text-white hover:bg-white/20"
          disabled={isProcessing}
        >
          <X className="w-6 h-6" />
        </Button>
      </div>

      {/* Video Area */}
      <div className="flex-1 relative flex items-center justify-center">
        {error && !isProcessing ? (
          <div className="text-center p-8 text-white">
            <p className="text-lg mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => setError(null)} variant="secondary">
                Tentar novamente
              </Button>
              <Button onClick={handleClose} variant="outline">
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Guia */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-4/5 max-w-md h-24 border-2 border-primary rounded-lg flex items-center justify-center">
                <span className="text-white text-sm bg-black/50 px-2 py-1 rounded">
                  Aponte para o código
                </span>
              </div>
            </div>

            {isStarting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-white text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                  <p>Iniciando câmera...</p>
                </div>
              </div>
            )}

            {isProcessing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <div className="text-white text-center">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-2" />
                  <p>Lendo código...</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="bg-black/80 p-4 flex justify-center gap-4">
        <Button
          onClick={handleCapture}
          disabled={isStarting || isProcessing || !!error}
          className="w-40"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Lendo...
            </>
          ) : (
            "Capturar"
          )}
        </Button>
        <Button onClick={handleClose} variant="outline" disabled={isProcessing}>
          Cancelar
        </Button>
      </div>
    </div>
  );
};

export default CameraOCR;

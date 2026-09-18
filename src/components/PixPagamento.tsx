import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabaseKiosk, garantirSessaoKiosk } from "@/integrations/supabase/kioskClient";
import { CheckCircle, Copy, Loader2, QrCode, TimerOff } from "lucide-react";
import BackButton from "@/components/BackButton";
import { toast } from "sonner";

const POLL_MS = 2000;

type StatusUI = "AGUARDANDO" | "PAGA" | "EXPIRADA" | "CANCELADA" | "ERRO";

interface CheckoutPix {
  reserva_id: number;
  checkout_token: string;
  valor_total: number;
  expira_em: string;
  qr_code_text: string | null;
  qr_code_png_url: string | null;
}

interface Props {
  mercadinhoId: number;
  tabletId: number | null;
  clienteId: number | null;
  itens: { prateleira_id: number; quantidade: number }[];
  total: number;
  onVoltar: () => void;
  onPago: () => void;
}

const MENSAGENS_ERRO: Record<string, string> = {
  CLIENTE_INCOMPLETO:
    "O cadastro deste cliente está incompleto para pagar com PIX. Peça para o responsável completar os dados.",
  DADO_CLIENTE_INVALIDO:
    "Há um dado inválido no cadastro deste cliente. Peça para o responsável corrigir.",
  CLIENTE_OBRIGATORIO_PIX: "É preciso identificar o cliente para pagar com PIX.",
  CLIENTE_INATIVO: "Este cliente não está ativo.",
  ESTOQUE_INSUFICIENTE:
    "Um dos produtos não está mais disponível na quantidade selecionada.",
  PRATELEIRA_INATIVA:
    "Um dos produtos não está mais disponível na quantidade selecionada.",
  TABLET_INATIVO: "Este equipamento não está liberado para vendas.",
};

function mensagemDeErro(codigo?: string) {
  if (codigo && MENSAGENS_ERRO[codigo]) return MENSAGENS_ERRO[codigo];
  return "Não foi possível gerar o PIX agora. Tente novamente.";
}

export default function PixPagamento({
  mercadinhoId,
  tabletId,
  clienteId,
  itens,
  total,
  onVoltar,
  onPago,
}: Props) {
  const [gerando, setGerando] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutPix | null>(null);
  const [status, setStatus] = useState<StatusUI>("AGUARDANDO");
  const [erroTexto, setErroTexto] = useState<string | null>(null);
  const [restante, setRestante] = useState(0);

  const pollRef = useRef<number | null>(null);
  const pagoRef = useRef(false);

  const pararPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Sempre encerrar o polling ao desmontar / sair da tela.
  useEffect(() => () => pararPolling(), [pararPolling]);

  const gerarPix = useCallback(async () => {
    if (gerando) return;
    setGerando(true);
    setErroTexto(null);
    try {
      await garantirSessaoKiosk();
      const { data, error } = await supabaseKiosk.functions.invoke(
        "iniciar-checkout-pix",
        {
          body: {
            mercadinho_id: mercadinhoId,
            tablet_id: tabletId,
            cliente_id: clienteId,
            chave_idempotencia: crypto.randomUUID(),
            itens,
          },
        },
      );

      let resp = (data ?? null) as Record<string, unknown> | null;

      // Erros HTTP (4xx/5xx) chegam em `error`; o corpo JSON vem em error.context
      if (!resp && error) {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          resp = await ctx.json().catch(() => null);
        }
      }

      if (!resp || resp.ok !== true) {
        setErroTexto(mensagemDeErro(resp?.codigo as string | undefined));
        return;
      }

      setCheckout({
        reserva_id: Number(resp.reserva_id),
        checkout_token: String(resp.checkout_token),
        valor_total: Number(resp.valor_total),
        expira_em: String(resp.expira_em),
        qr_code_text: (resp.qr_code_text as string) ?? null,
        qr_code_png_url: (resp.qr_code_png_url as string) ?? null,
      });
      setStatus("AGUARDANDO");
    } catch {
      setErroTexto("Não foi possível gerar o PIX agora. Tente novamente.");
    } finally {
      setGerando(false);
    }
  }, [gerando, mercadinhoId, tabletId, clienteId, itens]);

  // Polling de status — o backend é a única autoridade.
  useEffect(() => {
    if (!checkout) return;
    pararPolling();

    const consultar = async () => {
      try {
        const { data } = await supabaseKiosk.functions.invoke(
          "status-checkout-pix",
          {
            body: {
              reserva_id: checkout.reserva_id,
              checkout_token: checkout.checkout_token,
            },
          },
        );
        const resp = (data ?? null) as Record<string, unknown> | null;
        if (!resp || resp.ok !== true) return;
        const novo = String(resp.status) as StatusUI;
        setStatus(novo);
        if (novo !== "AGUARDANDO") {
          pararPolling();
          if (novo === "PAGA" && !pagoRef.current) {
            pagoRef.current = true;
            onPago();
          }
        }
      } catch {
        /* falha transitória: mantém polling */
      }
    };

    consultar();
    pollRef.current = window.setInterval(consultar, POLL_MS);
    return () => pararPolling();
  }, [checkout, pararPolling, onPago]);

  // Contagem regressiva apenas visual.
  useEffect(() => {
    if (!checkout) return;
    const alvo = new Date(checkout.expira_em).getTime();
    const tick = () =>
      setRestante(Math.max(0, Math.floor((alvo - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [checkout]);

  const copiar = async () => {
    if (!checkout?.qr_code_text) return;
    try {
      await navigator.clipboard.writeText(checkout.qr_code_text);
      toast.success("Código copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const sair = () => {
    pararPolling();
    onVoltar();
  };

  const mmss = `${String(Math.floor(restante / 60)).padStart(2, "0")}:${
    String(restante % 60).padStart(2, "0")
  }`;

  // ---------- Pagamento aprovado ----------
  if (status === "PAGA") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="text-center space-y-6">
          <CheckCircle className="w-24 h-24 text-green-500 mx-auto" />
          <h1 className="text-4xl font-bold text-green-600">Pagamento aprovado!</h1>
          <p className="text-xl text-muted-foreground">Obrigado pela sua compra</p>
          <p className="text-muted-foreground">Redirecionando...</p>
        </div>
      </div>
    );
  }

  // ---------- Encerrado sem pagamento ----------
  if (status === "EXPIRADA" || status === "CANCELADA" || status === "ERRO") {
    const titulo = status === "EXPIRADA"
      ? "Este PIX expirou."
      : status === "CANCELADA"
      ? "Este PIX foi cancelado."
      : "Não foi possível concluir este PIX.";
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6 text-center">
          <TimerOff className="w-20 h-20 text-muted-foreground mx-auto" />
          <h1 className="text-3xl font-bold">{titulo}</h1>
          <p className="text-lg text-muted-foreground">
            Nenhuma cobrança foi registrada. Você pode gerar um novo PIX.
          </p>
          <Button
            size="lg"
            className="w-full h-16 text-xl"
            onClick={() => {
              setCheckout(null);
              setStatus("AGUARDANDO");
              gerarPix();
            }}
          >
            Gerar novo PIX
          </Button>
          <Button variant="ghost" className="w-full" onClick={sair}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Antes de gerar ----------
  if (!checkout) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <BackButton onClick={sair} />
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-bold">Pagamento PIX</h1>
            <p className="text-3xl font-bold text-foreground">
              R$ {total.toFixed(2)}
            </p>
          </div>

          {erroTexto && (
            <p className="text-center text-lg text-destructive">{erroTexto}</p>
          )}

          <Button
            size="lg"
            className="w-full h-16 text-xl"
            onClick={gerarPix}
            disabled={gerando}
          >
            {gerando ? (
              <>
                <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                Gerando PIX...
              </>
            ) : (
              <>
                <QrCode className="w-6 h-6 mr-3" />
                Gerar PIX
              </>
            )}
          </Button>

          <Button variant="ghost" className="w-full" onClick={sair} disabled={gerando}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Aguardando pagamento ----------
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <BackButton onClick={sair} />

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Pagamento PIX</h1>
          <p className="text-3xl font-bold text-foreground">
            R$ {checkout.valor_total.toFixed(2)}
          </p>
          <p className="text-lg text-muted-foreground">
            Expira em <span className="font-semibold">{mmss}</span>
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          {checkout.qr_code_png_url ? (
            <div className="bg-white p-4 rounded-xl shadow-lg">
              <img
                src={checkout.qr_code_png_url}
                alt="QR Code PIX"
                className="w-64 h-64 object-contain"
              />
            </div>
          ) : (
            <div className="bg-white p-8 rounded-xl shadow-lg">
              <div className="w-64 h-64 border-4 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center">
                <QrCode className="w-16 h-16 text-muted-foreground" />
              </div>
            </div>
          )}

          {checkout.qr_code_text && (
            <Button variant="outline" className="w-full h-14 text-lg" onClick={copiar}>
              <Copy className="w-5 h-5 mr-2" />
              Copiar código
            </Button>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 text-lg text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Aguardando pagamento...
        </div>

        <Button variant="ghost" className="w-full" onClick={sair}>
          Voltar
        </Button>
      </div>
    </div>
  );
}

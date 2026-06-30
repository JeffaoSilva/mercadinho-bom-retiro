import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, XCircle, Wallet, ArrowDownCircle, Calendar, Clock } from "lucide-react";

export type DistribuicaoAbat = {
  mes: string;
  mes_formatado: string;
  valor_aplicado: number;
};

export type PagamentoAplicado = {
  abatimento_id: number;
  data_lancamento_brasil: string;
  hora_lancamento_brasil: string;
  valor_lancado: number;
  valor_aplicado_no_mes_visualizado: number;
  distribuicao: DistribuicaoAbat[];
};

export type PagamentoLancado = {
  abatimento_id: number;
  data_lancamento_brasil: string;
  hora_lancamento_brasil: string;
  valor_lancado: number;
  distribuicao: DistribuicaoAbat[];
};

function formatBRL(value: number): string {
  return (value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

type StatusKind = "quitado" | "parcial" | "aberto" | "sem_divida";

function getMesStatus(totalCaderneta: number, abatido: number): StatusKind {
  if (totalCaderneta <= 0) return "sem_divida";
  const saldo = totalCaderneta - abatido;
  if (saldo <= 0.001) return "quitado";
  if (abatido > 0) return "parcial";
  return "aberto";
}

function statusBadge(kind: StatusKind) {
  switch (kind) {
    case "quitado":
      return {
        icon: <CheckCircle2 className="h-5 w-5" />,
        label: "Quitado",
        text: "text-emerald-700 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-950/40",
        border: "border-emerald-200 dark:border-emerald-900",
      };
    case "parcial":
      return {
        icon: <AlertCircle className="h-5 w-5" />,
        label: "Parcialmente quitado",
        text: "text-amber-700 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/40",
        border: "border-amber-200 dark:border-amber-900",
      };
    case "aberto":
      return {
        icon: <XCircle className="h-5 w-5" />,
        label: "Em aberto",
        text: "text-rose-700 dark:text-rose-400",
        bg: "bg-rose-50 dark:bg-rose-950/40",
        border: "border-rose-200 dark:border-rose-900",
      };
    case "sem_divida":
      return {
        icon: <CheckCircle2 className="h-5 w-5" />,
        label: "Sem dívida",
        text: "text-sky-700 dark:text-sky-400",
        bg: "bg-sky-50 dark:bg-sky-950/40",
        border: "border-sky-200 dark:border-sky-900",
      };
  }
}

function distribuicaoStatus(d: DistribuicaoAbat) {
  // We don't have explicit per-month status in distribuicao, so display generic "Aplicado"
  return {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
    label: "Aplicado",
  };
}

export function PagamentosModal({
  open,
  onOpenChange,
  mesLabel,
  totalCaderneta,
  abatimentoAplicadoMes,
  aplicados,
  lancados,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mesLabel: string;
  totalCaderneta: number;
  abatimentoAplicadoMes: number;
  aplicados: PagamentoAplicado[];
  lancados: PagamentoLancado[];
}) {
  const dividaOriginal = totalCaderneta;
  const saldoRestante = Math.max(0, totalCaderneta - abatimentoAplicadoMes);
  const status = getMesStatus(totalCaderneta, abatimentoAplicadoMes);
  const statusInfo = statusBadge(status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg sm:max-w-xl p-0">
        <div className="px-5 pt-5 pb-3 border-b">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-xl font-bold">
              Pagamentos • {mesLabel}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Veja como os pagamentos afetaram este mês.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Resumo do mês */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="rounded-2xl border-muted">
              <CardContent className="p-3 flex flex-col items-center text-center gap-1">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Dívida original
                </div>
                <div className="text-base sm:text-lg font-bold">
                  {formatBRL(dividaOriginal)}
                </div>
              </CardContent>
            </Card>
            <Card className={`rounded-2xl ${statusInfo.border} ${statusInfo.bg}`}>
              <CardContent className="p-3 flex flex-col items-center text-center gap-1">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Situação
                </div>
                <div className={`flex items-center gap-1 font-semibold text-sm ${statusInfo.text}`}>
                  {statusInfo.icon}
                  <span>{statusInfo.label}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-muted">
              <CardContent className="p-3 flex flex-col items-center text-center gap-1">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Saldo restante
                </div>
                <div className="text-base sm:text-lg font-bold">
                  {formatBRL(saldoRestante)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Seção: pagamentos aplicados neste mês */}
          <section className="flex flex-col gap-3">
            {aplicados.length === 0 ? (
              <Card className="rounded-2xl border-dashed bg-muted/30">
                <CardContent className="p-5 text-center flex flex-col gap-2 items-center">
                  <Wallet className="h-8 w-8 text-muted-foreground" />
                  <div className="font-semibold">
                    Este mês ainda não recebeu nenhum pagamento.
                  </div>
                  {lancados.length > 0 && (
                    <div className="text-sm text-muted-foreground">
                      Todo o pagamento recebido neste mês foi utilizado primeiro para quitar meses anteriores.
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-muted-foreground px-1">
                  Este mês foi reduzido pelos seguintes pagamentos:
                </h3>
                <div className="flex flex-col gap-3">
                  {aplicados.map((a) => (
                    <Card
                      key={`ap-${a.abatimento_id}`}
                      className="rounded-2xl overflow-hidden border-emerald-200 dark:border-emerald-900"
                    >
                      <div className="bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                          <ArrowDownCircle className="h-5 w-5" />
                          <div className="flex flex-col">
                            <div className="text-xs flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {a.data_lancamento_brasil}
                              <Clock className="h-3 w-3 ml-1" />
                              {a.hora_lancamento_brasil}
                            </div>
                            <div className="text-xs font-medium opacity-80">
                              Pagamento recebido
                            </div>
                          </div>
                        </div>
                        <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                          {formatBRL(Number(a.valor_lancado))}
                        </div>
                      </div>
                      <CardContent className="p-4 flex flex-col gap-2">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Este pagamento foi utilizado para:
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {a.distribuicao && a.distribuicao.length > 0 ? (
                            a.distribuicao.map((d) => {
                              const ds = distribuicaoStatus(d);
                              return (
                                <div
                                  key={d.mes}
                                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                                >
                                  <div className="flex items-center gap-2 text-sm">
                                    {ds.icon}
                                    <span className="font-medium">{d.mes_formatado}</span>
                                  </div>
                                  <span className="text-sm font-semibold">
                                    {formatBRL(Number(d.valor_aplicado))}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                              <span className="text-sm font-medium">{mesLabel}</span>
                              <span className="text-sm font-semibold">
                                {formatBRL(Number(a.valor_aplicado_no_mes_visualizado))}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Seção: pagamentos lançados neste mês (mês do pagamento) */}
          {lancados.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground px-1">
                Pagamento realizado neste mês:
              </h3>
              <div className="flex flex-col gap-3">
                {lancados.map((a) => (
                  <Card
                    key={`la-${a.abatimento_id}`}
                    className="rounded-2xl overflow-hidden border-primary/40"
                  >
                    <div className="bg-primary/10 px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-primary">
                        <Wallet className="h-5 w-5" />
                        <div className="flex flex-col">
                          <div className="text-xs flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {a.data_lancamento_brasil}
                            <Clock className="h-3 w-3 ml-1" />
                            {a.hora_lancamento_brasil}
                          </div>
                          <div className="text-xs font-medium opacity-80">
                            Pagamento realizado
                          </div>
                        </div>
                      </div>
                      <div className="text-lg font-bold text-primary">
                        {formatBRL(Number(a.valor_lancado))}
                      </div>
                    </div>
                    <CardContent className="p-4 flex flex-col gap-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Este pagamento foi distribuído da seguinte forma:
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {a.distribuicao && a.distribuicao.length > 0 ? (
                          a.distribuicao.map((d) => {
                            const ds = distribuicaoStatus(d);
                            return (
                              <div
                                key={d.mes}
                                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                              >
                                <div className="flex items-center gap-2 text-sm">
                                  {ds.icon}
                                  <span className="font-medium">{d.mes_formatado}</span>
                                </div>
                                <span className="text-sm font-semibold">
                                  {formatBRL(Number(d.valor_aplicado))}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            Sem distribuição registrada.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Rodapé: saldo restante */}
          <Card className={`rounded-2xl ${statusInfo.border} ${statusInfo.bg}`}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Saldo restante
                </div>
                <div className="text-2xl font-bold mt-0.5">
                  {formatBRL(saldoRestante)}
                </div>
              </div>
              <div className={`flex items-center gap-2 font-semibold text-sm ${statusInfo.text}`}>
                {statusInfo.icon}
                <span className="text-right">
                  {status === "quitado" && "Dívida totalmente quitada"}
                  {status === "parcial" && "Dívida parcialmente quitada"}
                  {status === "aberto" && "Dívida em aberto"}
                  {status === "sem_divida" && "Sem dívida no mês"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

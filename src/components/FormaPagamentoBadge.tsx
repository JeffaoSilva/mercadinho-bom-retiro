const LABELS: Record<string, string> = {
  pix: "PIX",
  caderneta: "Caderneta",
};

/** Rótulo legível para qualquer forma de pagamento, inclusive futuras. */
export function formaPagamentoLabel(forma?: string | null): string {
  if (!forma) return "Não informada";
  const key = forma.trim().toLowerCase();
  if (LABELS[key]) return LABELS[key];
  const legivel = key.replace(/[_-]+/g, " ").trim();
  return legivel.charAt(0).toUpperCase() + legivel.slice(1);
}

export function FormaPagamentoBadge({ forma }: { forma?: string | null }) {
  const key = (forma || "").trim().toLowerCase();
  const cls =
    key === "pix"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
      : key === "caderneta"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
      : "bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${cls}`}>
      {formaPagamentoLabel(forma)}
    </span>
  );
}

export default FormaPagamentoBadge;

interface PaymentBadgeProps {
  formaPagamento: string;
}

export function PaymentBadge({ formaPagamento }: PaymentBadgeProps) {
  if (formaPagamento === "pix") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
        PIX
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
      CADERNETA
    </span>
  );
}

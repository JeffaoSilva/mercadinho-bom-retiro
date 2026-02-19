import { toast } from "sonner";

interface SaleToastOptions {
  mercadinhoNome: string;
  mercadinhoId: number;
  clienteNome: string;
  valorTotal: number;
}

export function showSaleToast({
  mercadinhoNome,
  mercadinhoId,
  clienteNome,
  valorTotal,
}: SaleToastOptions) {
  const bgColor = mercadinhoId === 1 ? "#166534" : "#1e3a5f";

  toast.custom(
    () => (
      <div
        style={{
          backgroundColor: bgColor,
          color: "#ffffff",
          borderRadius: "12px",
          padding: "20px 28px",
          minWidth: "340px",
          maxWidth: "420px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.32)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {/* Linha superior: ícone + título + loja */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span style={{ fontSize: "26px" }}>🛒</span>
          <span
            style={{
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "0.01em",
              flexGrow: 1,
            }}
          >
            Nova Venda
          </span>
          <span
            style={{
              fontSize: "13px",
              opacity: 0.8,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {mercadinhoNome}
          </span>
        </div>

        {/* Linha inferior: cliente + valor */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "4px",
          }}
        >
          <span style={{ fontSize: "16px", opacity: 0.9 }}>
            👤 {clienteNome}
          </span>
          <span
            style={{
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "0.02em",
            }}
          >
            R$ {valorTotal.toFixed(2)}
          </span>
        </div>
      </div>
    ),
    { duration: 5000 }
  );
}

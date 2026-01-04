import * as React from "react";
import { cn } from "@/lib/utils";

interface MoneyInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  className?: string;
}

/**
 * Input monetário com máscara automática pt-BR
 * - Usuário digita números e a vírgula se move automaticamente
 * - Aceita colar valores com vírgula, ponto ou R$
 * - Retorna number para salvar no Supabase
 */
const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, placeholder = "0,00", disabled = false, allowEmpty = false, className }, ref) => {
    
    // Estado interno: string contendo apenas dígitos (centavos)
    const [digits, setDigits] = React.useState<string>(() => {
      if (value === null || value === undefined) {
        return allowEmpty ? "" : "0";
      }
      // Converter number para centavos como string
      const cents = Math.round(value * 100);
      return cents.toString();
    });

    // Sync quando value externo muda (ex: edição de produto existente)
    const prevValueRef = React.useRef(value);
    React.useEffect(() => {
      if (prevValueRef.current !== value) {
        prevValueRef.current = value;
        if (value === null || value === undefined) {
          setDigits(allowEmpty ? "" : "0");
        } else {
          const cents = Math.round(value * 100);
          setDigits(cents.toString());
        }
      }
    }, [value, allowEmpty]);

    // Converter digits para display formatado pt-BR
    const formatDisplay = (d: string): string => {
      if (d === "" && allowEmpty) return "";
      const cents = parseInt(d, 10) || 0;
      const reais = cents / 100;
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(reais);
    };

    // Converter digits para number
    const digitsToNumber = (d: string): number | null => {
      if (d === "" && allowEmpty) return null;
      const cents = parseInt(d, 10) || 0;
      return cents / 100;
    };

    // Parse de string colada (3,50 ou 3.50 ou R$ 3,50 ou 1.234,56)
    const parseFlexible = (str: string): string => {
      // Remove R$, espaços
      let cleaned = str.replace(/R\$\s*/gi, "").trim();
      
      if (!cleaned) return allowEmpty ? "" : "0";
      
      // Detectar formato
      const hasComma = cleaned.includes(",");
      const hasDot = cleaned.includes(".");
      
      let numericValue: number;
      
      if (hasComma && hasDot) {
        // Formato brasileiro: 1.234,56 -> vírgula é decimal
        if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
          cleaned = cleaned.replace(/\./g, "").replace(",", ".");
        } else {
          // Formato americano: 1,234.56 -> ponto é decimal
          cleaned = cleaned.replace(/,/g, "");
        }
        numericValue = parseFloat(cleaned);
      } else if (hasComma) {
        // Só vírgula: trocar por ponto
        cleaned = cleaned.replace(",", ".");
        numericValue = parseFloat(cleaned);
      } else if (hasDot) {
        // Só ponto: pode ser decimal
        numericValue = parseFloat(cleaned);
      } else {
        // Só dígitos
        numericValue = parseFloat(cleaned);
      }
      
      if (isNaN(numericValue)) return allowEmpty ? "" : "0";
      
      // Converter para centavos
      const cents = Math.round(numericValue * 100);
      return cents.toString();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      
      // Se usuário limpou o campo
      if (!rawValue || rawValue.trim() === "") {
        setDigits(allowEmpty ? "" : "0");
        onChange(allowEmpty ? null : 0);
        return;
      }

      // Extrair apenas dígitos do valor atual
      const newDigits = rawValue.replace(/\D/g, "");
      
      // Se não tem dígitos após limpeza
      if (!newDigits) {
        setDigits(allowEmpty ? "" : "0");
        onChange(allowEmpty ? null : 0);
        return;
      }

      // Remover zeros à esquerda (exceto se for só zeros)
      const normalizedDigits = newDigits.replace(/^0+/, "") || "0";
      
      setDigits(normalizedDigits);
      onChange(digitsToNumber(normalizedDigits));
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text");
      const newDigits = parseFlexible(pasted);
      setDigits(newDigits);
      onChange(digitsToNumber(newDigits));
    };

    const handleBlur = () => {
      // Garantir estado consistente ao sair
      if (digits === "" && allowEmpty) {
        onChange(null);
        return;
      }
      const normalizedDigits = digits.replace(/^0+/, "") || "0";
      setDigits(normalizedDigits);
      onChange(digitsToNumber(normalizedDigits));
    };

    const displayValue = formatDisplay(digits);

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={displayValue}
        onChange={handleChange}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
      />
    );
  }
);

MoneyInput.displayName = "MoneyInput";

export { MoneyInput };

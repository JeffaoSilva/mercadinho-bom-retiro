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
 * - Converte ponto para vírgula no display
 * - Retorna number para salvar no Supabase
 */
const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, placeholder = "0,00", disabled = false, allowEmpty = false, className }, ref) => {
    // Converter value (number) para string formatada pt-BR
    const formatDisplay = (val: number | null): string => {
      if (val === null || val === undefined) {
        return allowEmpty ? "" : "0,00";
      }
      return val.toFixed(2).replace(".", ",");
    };

    const [displayValue, setDisplayValue] = React.useState(() => formatDisplay(value));

    // Sync quando value externo muda
    React.useEffect(() => {
      setDisplayValue(formatDisplay(value));
    }, [value, allowEmpty]);

    // Converter string formatada para centavos
    const parseToCents = (str: string): number => {
      // Remove tudo que não é dígito
      const digits = str.replace(/\D/g, "");
      return parseInt(digits, 10) || 0;
    };

    // Converter centavos para number (reais)
    const centsToNumber = (cents: number): number => {
      return cents / 100;
    };

    // Formatar centavos para display
    const formatFromCents = (cents: number): string => {
      const reais = cents / 100;
      return reais.toFixed(2).replace(".", ",");
    };

    // Parse de string colada/digitada manualmente (3,50 ou 3.50 ou R$ 3,50)
    const parseFlexible = (str: string): number | null => {
      // Remove R$, espaços
      let cleaned = str.replace(/R\$\s*/gi, "").trim();
      
      // Se está vazio
      if (!cleaned) return allowEmpty ? null : 0;
      
      // Detectar se tem separador decimal
      // Se tem vírgula E ponto, vírgula é milhar e ponto é decimal (formato 1.234,56) ou vice-versa
      const hasComma = cleaned.includes(",");
      const hasDot = cleaned.includes(".");
      
      if (hasComma && hasDot) {
        // Formato brasileiro: 1.234,56 -> vírgula é decimal
        if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
          cleaned = cleaned.replace(/\./g, "").replace(",", ".");
        } else {
          // Formato americano: 1,234.56 -> ponto é decimal
          cleaned = cleaned.replace(/,/g, "");
        }
      } else if (hasComma) {
        // Só vírgula: trocar por ponto
        cleaned = cleaned.replace(",", ".");
      }
      // Se só tem ponto, já está ok
      
      const num = parseFloat(cleaned);
      return isNaN(num) ? (allowEmpty ? null : 0) : num;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      
      // Se usuário limpou o campo
      if (!rawValue) {
        setDisplayValue("");
        onChange(allowEmpty ? null : 0);
        return;
      }

      // Verificar se é digitação normal (só números) ou input livre (colagem)
      const onlyDigits = rawValue.replace(/\D/g, "");
      const hasNonDigit = rawValue !== onlyDigits;

      if (hasNonDigit) {
        // Usuário colou ou digitou com vírgula/ponto - parse flexível
        const parsed = parseFlexible(rawValue);
        const formatted = parsed !== null ? formatDisplay(parsed) : "";
        setDisplayValue(formatted);
        onChange(parsed);
      } else {
        // Modo "digita números e vírgula se move"
        const cents = parseInt(onlyDigits, 10) || 0;
        const formatted = formatFromCents(cents);
        setDisplayValue(formatted);
        onChange(centsToNumber(cents));
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text");
      const parsed = parseFlexible(pasted);
      const formatted = parsed !== null ? formatDisplay(parsed) : "";
      setDisplayValue(formatted);
      onChange(parsed);
    };

    const handleBlur = () => {
      // Garantir formatação correta ao sair do campo
      if (displayValue === "" && allowEmpty) {
        onChange(null);
        return;
      }
      const parsed = parseFlexible(displayValue);
      const formatted = parsed !== null ? formatDisplay(parsed) : "0,00";
      setDisplayValue(formatted);
      onChange(parsed);
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
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

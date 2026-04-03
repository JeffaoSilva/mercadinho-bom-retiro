import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ClearableInputProps extends React.ComponentProps<"input"> {
  onClear?: () => void;
}

const ClearableInput = React.forwardRef<HTMLInputElement, ClearableInputProps>(
  ({ className, value, onClear, ...props }, ref) => {
    const hasValue = value !== undefined && value !== null && value !== "";

    return (
      <div className="relative w-full">
        <input
          ref={ref}
          value={value}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            hasValue && onClear && "pr-9",
            className,
          )}
          {...props}
        />
        {hasValue && onClear && (
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => {
              e.preventDefault();
              onClear();
            }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  },
);
ClearableInput.displayName = "ClearableInput";

export { ClearableInput };

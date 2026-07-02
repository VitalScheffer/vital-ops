import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";

// Select estilizado, tema-consistente (claro/escuro), usado no lugar de
// `<select>` nativo em todo o app. Mesmo padrão de cor dos inputs (bg-field/
// border-border/text-card-foreground) + seta própria via `appearance-none`.
//
// As `<option>` filhas precisam levar `className="bg-card text-foreground"`
// (o navegador ainda controla boa parte do estilo do popup nativo — isto é o
// máximo de consistência de tema que dá pra garantir nas opções).
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  // Classes extras para o `<div>` que envolve o select (ex.: min-w-[13rem]).
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, containerClassName, disabled, children, ...props },
  ref,
) {
  return (
    <div className={`relative ${containerClassName ?? "w-full"}`}>
      <select
        ref={ref}
        disabled={disabled}
        className={`w-full cursor-pointer appearance-none rounded-lg border border-border bg-field px-3 py-2 pr-8 text-sm text-card-foreground outline-none transition-colors focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
});

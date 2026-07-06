"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

// Botão de submit do login como client component só para ter feedback real:
// `useFormStatus` sabe quando o form (Server Action) está enviando, então
// mostramos spinner + "Entrando…" e travamos o botão. O active:scale dá a
// sensação de "pressionado" no clique (o form antes navegava sem nenhum retorno
// visual, parecia que não tinha clicado).
export function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-sm transition-[filter,transform] duration-100 hover:brightness-110 active:scale-[0.98] active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-turquesa disabled:cursor-progress disabled:opacity-90"
      style={{ background: "var(--vs-turquesa)" }}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Entrando…
        </>
      ) : (
        <>
          Entrar
          <span aria-hidden>→</span>
        </>
      )}
    </button>
  );
}

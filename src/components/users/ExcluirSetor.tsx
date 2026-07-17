"use client";

import { X } from "lucide-react";
import { useActionState, useState } from "react";

import { excluirSetor } from "@/app/(app)/usuarios/actions";
import { IDLE_FORM_STATE } from "@/lib/form";

// Excluir um setor (com confirmação inline). Se o setor tiver requisições, a
// Server Action recusa e a mensagem aparece ao lado. Sucesso = revalidatePath
// refaz a lista sem o setor.
export function ExcluirSetor({ setorId }: { setorId: string }) {
  const [state, formAction, pending] = useActionState(excluirSetor, IDLE_FORM_STATE);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="id" value={setorId} />
      {confirmando ? (
        <>
          <button
            type="submit"
            disabled={pending}
            className="text-xs font-medium text-destructive hover:underline disabled:opacity-60"
          >
            {pending ? "excluindo…" : "excluir"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="text-xs text-muted-foreground hover:text-card-foreground"
          >
            não
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          aria-label="Excluir setor"
          className="text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {state.status === "error" ? (
        <span className="ml-1 max-w-xs text-xs text-destructive">{state.message}</span>
      ) : null}
    </form>
  );
}

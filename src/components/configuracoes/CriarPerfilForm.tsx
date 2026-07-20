"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";

import { criarPerfil } from "@/app/(app)/configuracoes/actions";
import { FormFeedback } from "@/components/FormFeedback";
import { IDLE_FORM_STATE } from "@/lib/form";

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

// Cria um perfil de acesso novo. Ele nasce sem módulos; depois é só marcar na
// tabela abaixo e salvar.
export function CriarPerfilForm() {
  const [state, formAction, pending] = useActionState(criarPerfil, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-card-foreground">
          Novo perfil de acesso
          <input name="nome" required maxLength={60} placeholder="Ex.: Compras, Expedição…" className={inputClass} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {pending ? "Criando…" : "Criar perfil"}
        </button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}

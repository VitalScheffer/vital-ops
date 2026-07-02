"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { createSetor } from "@/app/(app)/usuarios/actions";
import { FormFeedback } from "@/components/FormFeedback";
import { IDLE_FORM_STATE } from "@/lib/form";

export function CreateSetorForm() {
  const [state, formAction, pending] = useActionState(createSetor, IDLE_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="setor-nome" className="text-sm font-medium text-card-foreground">
          Nome do setor
        </label>
        <input
          id="setor-nome"
          name="nome"
          required
          placeholder="Ex.: Engenharia"
          className="rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary"
        />
      </div>

      <FormFeedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        {pending ? "Criando…" : "Adicionar setor"}
      </button>
    </form>
  );
}

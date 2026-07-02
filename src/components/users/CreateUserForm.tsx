"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { createUser } from "@/app/(app)/usuarios/actions";
import { FormFeedback } from "@/components/FormFeedback";
import { Select } from "@/components/ui/Select";
import type { Setor } from "@/lib/contracts";
import { IDLE_FORM_STATE } from "@/lib/form";

interface CreateUserFormProps {
  setores: Setor[];
  canCreateAdmin: boolean;
}

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

export function CreateUserForm({ setores, canCreateAdmin }: CreateUserFormProps) {
  const [state, formAction, pending] = useActionState(createUser, IDLE_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="user-name" className="text-sm font-medium text-card-foreground">
            Nome
          </label>
          <input id="user-name" name="name" required placeholder="Nome completo" className={inputClass} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="user-email" className="text-sm font-medium text-card-foreground">
            E-mail
          </label>
          <input
            id="user-email"
            name="email"
            type="email"
            required
            placeholder="nome@vitalscheffer.com.br"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <label htmlFor="user-password" className="text-sm font-medium text-card-foreground">
          Senha inicial
        </label>
        <input
          id="user-password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="Mínimo de 6 caracteres"
          className={inputClass}
        />
        <p className="text-xs text-muted-foreground">
          Defina a senha de acesso. A pessoa entra com o e-mail e esta senha.
        </p>
      </div>

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <label htmlFor="user-role" className="text-sm font-medium text-card-foreground">
          Papel
        </label>
        <Select id="user-role" name="role" defaultValue="FUNCIONARIO">
          <option className="bg-card text-foreground" value="FUNCIONARIO">
            Funcionário
          </option>
          <option className="bg-card text-foreground" value="GESTOR">
            Gestor
          </option>
          {canCreateAdmin ? (
            <option className="bg-card text-foreground" value="ADMIN">
              Administrador
            </option>
          ) : null}
        </Select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-card-foreground">Setores</legend>
        {setores.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum setor cadastrado ainda. Crie um setor ao lado para poder associar.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {setores.map((setor) => (
              <label
                key={setor.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-card-foreground hover:bg-muted"
              >
                <input type="checkbox" name="setorIds" value={setor.id} className="accent-primary" />
                {setor.nome}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <FormFeedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <UserPlus className="h-4 w-4" />
        {pending ? "Criando…" : "Criar usuário"}
      </button>
    </form>
  );
}

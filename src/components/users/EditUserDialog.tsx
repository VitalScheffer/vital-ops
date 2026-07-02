"use client";

import { Pencil, UserCog, X } from "lucide-react";
import { useActionState, useEffect, useId, useState } from "react";

import { atualizarUsuario } from "@/app/(app)/usuarios/actions";
import { FormFeedback } from "@/components/FormFeedback";
import { Select } from "@/components/ui/Select";
import type { Role, Setor } from "@/lib/contracts";
import { IDLE_FORM_STATE } from "@/lib/form";

interface EditableUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  setorIds: string[];
}

interface EditUserDialogProps {
  user: EditableUser;
  setores: Setor[];
  // Só um ADMIN pode conceder/manter o papel ADMIN — controla a opção no select.
  canAssignAdmin: boolean;
}

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none transition-colors focus-visible:border-primary";

const labelClass = "text-sm font-medium text-card-foreground";

export function EditUserDialog({ user, setores, canAssignAdmin }: EditUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(atualizarUsuario, IDLE_FORM_STATE);
  const [handledState, setHandledState] = useState(state);
  const titleId = useId();

  // Fecha o modal quando a edição conclui com sucesso. Ajuste de estado no render
  // (padrão recomendado do React) comparando a referência do último resultado —
  // funciona mesmo em sucessos repetidos, pois cada resultado é um novo objeto.
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") {
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // O ADMIN aparece no select quando o ator pode concedê-lo OU quando o próprio
  // usuário já é ADMIN (senão o valor selecionado ficaria sem opção).
  const showAdminOption = canAssignAdmin || user.role === "ADMIN";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-card-foreground transition-colors hover:bg-muted"
        aria-label={`Editar ${user.name}`}
      >
        <Pencil className="h-3.5 w-3.5" />
        Editar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50"
            tabIndex={-1}
          />

          <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UserCog className="h-5 w-5" />
                </span>
                <div>
                  <h2 id={titleId} className="text-base font-semibold text-card-foreground">
                    Editar usuário
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              action={formAction}
              className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5"
            >
              <input type="hidden" name="id" value={user.id} />

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`edit-name-${user.id}`} className={labelClass}>
                  Nome
                </label>
                <input
                  id={`edit-name-${user.id}`}
                  name="name"
                  required
                  defaultValue={user.name}
                  className={inputClass}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`edit-role-${user.id}`} className={labelClass}>
                    Papel
                  </label>
                  <Select id={`edit-role-${user.id}`} name="role" defaultValue={user.role}>
                    <option className="bg-card text-foreground" value="FUNCIONARIO">
                      Funcionário
                    </option>
                    <option className="bg-card text-foreground" value="GESTOR">
                      Gestor
                    </option>
                    {showAdminOption ? (
                      <option className="bg-card text-foreground" value="ADMIN">
                        Administrador
                      </option>
                    ) : null}
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className={labelClass}>Status</span>
                  <label
                    htmlFor={`edit-active-${user.id}`}
                    className="flex h-[2.375rem] cursor-pointer items-center gap-2 rounded-lg border border-border bg-field px-3 text-sm text-card-foreground transition-colors hover:bg-muted"
                  >
                    <input
                      id={`edit-active-${user.id}`}
                      type="checkbox"
                      name="active"
                      defaultChecked={user.active}
                      className="h-4 w-4 accent-primary"
                    />
                    Usuário ativo (pode entrar)
                  </label>
                </div>
              </div>

              <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-field/50 p-3">
                <legend className="px-1 text-sm font-medium text-card-foreground">Setores</legend>
                {setores.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum setor cadastrado ainda.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {setores.map((setor) => (
                      <label
                        key={setor.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          name="setorIds"
                          value={setor.id}
                          defaultChecked={user.setorIds.includes(setor.id)}
                          className="h-4 w-4 accent-primary"
                        />
                        {setor.nome}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`edit-password-${user.id}`} className={labelClass}>
                  Nova senha (opcional)
                </label>
                <input
                  id={`edit-password-${user.id}`}
                  name="password"
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Deixe em branco para manter a senha atual"
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">
                  Em branco mantém a senha atual. Se preencher, use ao menos 6 caracteres.
                </p>
              </div>

              <FormFeedback state={state} />

              <div className="sticky bottom-0 -mx-6 -mb-5 mt-auto flex items-center justify-end gap-3 border-t border-border bg-card px-6 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? "Salvando…" : "Salvar alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

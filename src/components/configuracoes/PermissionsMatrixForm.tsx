"use client";

import { ShieldCheck } from "lucide-react";
import { useActionState } from "react";

import { atualizarPermissoes } from "@/app/(app)/configuracoes/actions";
import { ExcluirPerfil } from "@/components/configuracoes/ExcluirPerfil";
import { FormFeedback } from "@/components/FormFeedback";
import { IDLE_FORM_STATE } from "@/lib/form";
import { MODULES, type Module, type PerfilView, type RolePermissionsMap } from "@/lib/permissions";

const MODULE_LABEL: Record<Module, string> = {
  products: "Produtos",
  pranchas: "Pranchas",
  configurador: "Configurador",
  projetos: "Projetos (fila)",
  requisicoes: "Requisições",
  baixas: "Baixa de estoque",
  users: "Usuários e setores",
  audit: "Auditoria",
};

function fieldName(role: string, module: Module): string {
  return `perm__${role}__${module}`;
}

interface PermissionsMatrixFormProps {
  permissions: RolePermissionsMap;
  // Papéis editáveis (fixos não-admin + perfis customizados). ADMIN é linha
  // travada à parte (acesso total, regra de segurança em código).
  perfis: PerfilView[];
}

export function PermissionsMatrixForm({ permissions, perfis }: PermissionsMatrixFormProps) {
  const [state, formAction, pending] = useActionState(atualizarPermissoes, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Papel</th>
              {MODULES.map((module) => (
                <th key={module} className="px-4 py-2.5 font-medium">
                  {MODULE_LABEL[module]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/60 bg-field/40">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 font-medium text-card-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Administrador
                </div>
              </td>
              {MODULES.map((module) => (
                <td key={module} className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    aria-label={`Administrador sempre tem acesso a ${MODULE_LABEL[module]}`}
                    className="h-4 w-4 accent-primary opacity-60"
                  />
                </td>
              ))}
            </tr>
            {perfis.map((perfil) => (
              <tr key={perfil.codigo} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium text-card-foreground">
                    {perfil.nome}
                    {!perfil.fixo ? (
                      <>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase text-muted-foreground">
                          perfil
                        </span>
                        <ExcluirPerfil codigo={perfil.codigo} nome={perfil.nome} />
                      </>
                    ) : null}
                  </div>
                </td>
                {MODULES.map((module) => (
                  <td key={module} className="px-4 py-3">
                    <input
                      type="checkbox"
                      name={fieldName(perfil.codigo, module)}
                      defaultChecked={permissions[perfil.codigo]?.[module] ?? false}
                      aria-label={`${perfil.nome} — ${MODULE_LABEL[module]}`}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Administrador sempre vê tudo — é uma trava de segurança, não dá para desmarcar por aqui. Perfis
        criados por você começam sem nada; marque os módulos e salve.
      </p>

      <FormFeedback state={state} />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar permissões"}
      </button>
    </form>
  );
}

"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { MODULES, type Module } from "@/lib/permissions";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { requestHeaders } from "@/lib/request";

// Papéis editáveis pela tela — ADMIN nunca aparece aqui: acesso total é regra
// fixa em código (src/lib/permissions.ts trava ADMIN=true em todo módulo),
// então não há como um admin se autoexcluir de nada por esta tela.
const EDITABLE_ROLES = ["GESTOR", "FUNCIONARIO", "FABRICA"] as const;

function fieldName(role: string, module: Module): string {
  return `perm__${role}__${module}`;
}

// Atualiza a matriz papel×módulo (item 3 — permissões configuráveis). Guard
// de ADMIN é checado direto na sessão (fixo em código, não consulta a própria
// tabela que esta ação edita).
export async function atualizarPermissoes(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return { status: "error", message: "Sessão expirada. Entre novamente." };
  }
  if (session.user.role !== "ADMIN") {
    return { status: "error", message: "Apenas um Administrador altera permissões." };
  }

  const before = await getRolePermissionsMap();

  for (const role of EDITABLE_ROLES) {
    for (const mod of MODULES) {
      const enabled = formData.get(fieldName(role, mod)) === "on";
      await prisma.rolePermission.upsert({
        where: { role_module: { role, module: mod } },
        create: { role, module: mod, enabled },
        update: { enabled },
      });
    }
  }

  const after = await getRolePermissionsMap();

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "permissao.atualizar",
    entity: "RolePermission",
    summary: "Atualizou as permissões por papel e módulo.",
    before,
    after,
    req: await requestHeaders(),
  });

  // Revalida a partir do layout raiz: o menu lateral (montado no layout do
  // grupo (app)) precisa refletir a mudança já na próxima navegação.
  revalidatePath("/", "layout");
  return { status: "success", message: "Permissões atualizadas com sucesso." };
}

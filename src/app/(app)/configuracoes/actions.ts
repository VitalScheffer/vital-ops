"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { PAPEIS_FIXOS, ROTULO_PAPEL_FIXO } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { MODULES, type Module } from "@/lib/permissions";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { requestHeaders } from "@/lib/request";

function fieldName(role: string, module: Module): string {
  return `perm__${role}__${module}`;
}

function guardAdmin(role: string | undefined): boolean {
  return role === "ADMIN";
}

// Códigos editáveis na matriz: os fixos MENOS o ADMIN (acesso total travado em
// código) + os perfis customizados do banco.
async function codigosEditaveis(): Promise<string[]> {
  const custom = await prisma.perfil.findMany({ select: { codigo: true } });
  return [...PAPEIS_FIXOS.filter((p) => p !== "ADMIN"), ...custom.map((p) => p.codigo)];
}

// Atualiza a matriz papel×módulo. Guard de ADMIN direto na sessão (fixo em
// código, não consulta a tabela que edita).
export async function atualizarPermissoes(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return { status: "error", message: "Sessão expirada. Entre novamente." };
  }
  if (!guardAdmin(session.user.role)) {
    return { status: "error", message: "Apenas um Administrador altera permissões." };
  }

  const before = await getRolePermissionsMap();

  for (const role of await codigosEditaveis()) {
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

  // Revalida a partir do layout raiz: o menu lateral reflete a mudança já na
  // próxima navegação.
  revalidatePath("/", "layout");
  return { status: "success", message: "Permissões atualizadas com sucesso." };
}

const criarPerfilSchema = z.object({ nome: z.string().trim().min(1).max(60) });

// Cria um PERFIL de acesso customizado (só ADMIN). Ele nasce sem nenhum módulo;
// o admin marca na matriz. O `codigo` (cuid) vira o valor de User.role.
export async function criarPerfil(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return { status: "error", message: "Sessão expirada. Entre novamente." };
  }
  if (!guardAdmin(session.user.role)) {
    return { status: "error", message: "Apenas um Administrador cria perfis." };
  }

  const parsed = criarPerfilSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) {
    return { status: "error", message: "Informe um nome para o perfil." };
  }
  const { nome } = parsed.data;

  const reservados = new Set(
    [...PAPEIS_FIXOS, ...Object.values(ROTULO_PAPEL_FIXO)].map((s) => s.toLowerCase()),
  );
  if (reservados.has(nome.toLowerCase())) {
    return { status: "error", message: "Esse nome já é um papel do sistema. Use outro." };
  }
  const existe = await prisma.perfil.findUnique({ where: { nome }, select: { codigo: true } });
  if (existe) {
    return { status: "error", message: `Já existe um perfil chamado "${nome}".` };
  }

  const criado = await prisma.perfil.create({ data: { nome }, select: { codigo: true, nome: true } });
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "perfil.criar",
    entity: "Perfil",
    entityId: criado.codigo,
    summary: `Criou o perfil de acesso ${criado.nome}.`,
    after: criado,
    req: await requestHeaders(),
  });

  revalidatePath("/", "layout");
  return { status: "success", message: `Perfil "${criado.nome}" criado. Marque os módulos que ele acessa e salve.` };
}

// Exclui um perfil customizado (só ADMIN). Bloqueia se houver usuário com esse
// perfil (troque o papel deles antes). Remove também as linhas de permissão.
export async function excluirPerfil(codigo: string): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return { status: "error", message: "Sessão expirada. Entre novamente." };
  }
  if (!guardAdmin(session.user.role)) {
    return { status: "error", message: "Apenas um Administrador exclui perfis." };
  }
  const alvo = String(codigo ?? "").trim();
  if (!alvo || (PAPEIS_FIXOS as readonly string[]).includes(alvo)) {
    return { status: "error", message: "Esse perfil não pode ser excluído." };
  }

  const perfil = await prisma.perfil.findUnique({ where: { codigo: alvo }, select: { nome: true } });
  if (!perfil) {
    return { status: "error", message: "Perfil não encontrado." };
  }
  const emUso = await prisma.user.count({ where: { role: alvo } });
  if (emUso > 0) {
    return {
      status: "error",
      message: `O perfil "${perfil.nome}" está em uso por ${emUso} usuário(s). Troque o papel deles antes de excluir.`,
    };
  }

  await prisma.rolePermission.deleteMany({ where: { role: alvo } });
  await prisma.perfil.delete({ where: { codigo: alvo } });
  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "perfil.excluir",
    entity: "Perfil",
    entityId: alvo,
    summary: `Excluiu o perfil de acesso ${perfil.nome}.`,
    req: await requestHeaders(),
  });

  revalidatePath("/", "layout");
  return { status: "success", message: `Perfil "${perfil.nome}" excluído.` };
}

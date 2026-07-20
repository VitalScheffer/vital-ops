"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { createUserSchema, isPapelFixo, updateUserSchema } from "@/lib/contracts";
import type { Role } from "@/lib/contracts";
import { prisma } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canAssignRole, canEditUser, canManageUsers, wouldRemoveLastAdmin } from "@/lib/rbac";
import { requestHeaders } from "@/lib/request";

// Papel válido = um dos fixos OU o código de um perfil customizado existente.
// (User.role é string livre; a validação real de existência é aqui.)
async function papelValido(codigo: string): Promise<boolean> {
  if (isPapelFixo(codigo)) return true;
  return Boolean(await prisma.perfil.findUnique({ where: { codigo }, select: { codigo: true } }));
}

const FIELD_MESSAGES: Record<string, string> = {
  name: "Informe o nome.",
  email: "Informe um e-mail válido.",
  password: "A senha deve ter ao menos 6 caracteres.",
  role: "Papel inválido.",
  setorIds: "Setores inválidos.",
  nome: "Informe o nome do setor.",
};

function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "Dados inválidos.";
  }
  return FIELD_MESSAGES[String(issue.path[0] ?? "")] ?? "Dados inválidos.";
}

function unauthenticated(): FormState {
  return { status: "error", message: "Sessão expirada. Entre novamente." };
}

// Criação de usuário (ADMIN/GESTOR). Guard real de papel + auditoria.
export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return unauthenticated();
  }

  const actorRole = session.user.role;
  const permissions = await getRolePermissionsMap();
  if (!canManageUsers(actorRole, permissions)) {
    return { status: "error", message: "Você não tem permissão para criar usuários." };
  }

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") ?? undefined,
    setorIds: formData.getAll("setorIds"),
  });
  if (!parsed.success) {
    return { status: "error", message: firstIssueMessage(parsed.error) };
  }

  const { name, email, password, role, setorIds } = parsed.data;
  if (!(await papelValido(role))) {
    return { status: "error", message: "Papel/perfil inválido." };
  }
  if (!canAssignRole(actorRole, role, permissions)) {
    return {
      status: "error",
      message: "Apenas um Administrador pode conceder o papel ADMIN.",
    };
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { status: "error", message: `Já existe um usuário com o e-mail ${email}.` };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      setores: {
        create: setorIds.map((setorId) => ({ setor: { connect: { id: setorId } } })),
      },
    },
    select: { id: true, name: true, email: true, role: true },
  });

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "user.create",
    entity: "User",
    entityId: created.id,
    summary: `Criou o usuário ${created.name} (${created.email}) como ${created.role}.`,
    after: created,
    req: await requestHeaders(),
  });

  revalidatePath("/usuarios");
  return { status: "success", message: `Usuário ${created.name} criado com sucesso.` };
}

// Senha em branco = manter a atual; qualquer valor não-vazio vira nova senha.
function optionalPassword(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return value;
}

// Edição de usuário (ADMIN/GESTOR). Guards reais + auditoria com before/after.
export async function atualizarUsuario(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return unauthenticated();
  }

  const actorRole = session.user.role;
  const permissions = await getRolePermissionsMap();
  if (!canManageUsers(actorRole, permissions)) {
    return { status: "error", message: "Você não tem permissão para editar usuários." };
  }

  const parsed = updateUserSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    role: formData.get("role") ?? undefined,
    active: formData.get("active") === "on",
    setorIds: formData.getAll("setorIds"),
    password: optionalPassword(formData.get("password")),
  });
  if (!parsed.success) {
    return { status: "error", message: firstIssueMessage(parsed.error) };
  }

  const { id, name, role, active, setorIds, password } = parsed.data;
  if (!(await papelValido(role))) {
    return { status: "error", message: "Papel/perfil inválido." };
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      setores: { select: { setorId: true } },
    },
  });
  if (!target) {
    return { status: "error", message: "Usuário não encontrado." };
  }

  const targetRole = target.role as Role;
  if (!canEditUser(actorRole, targetRole, permissions)) {
    return {
      status: "error",
      message: "Apenas um Administrador pode editar um usuário Administrador.",
    };
  }
  if (!canAssignRole(actorRole, role, permissions)) {
    return {
      status: "error",
      message: "Apenas um Administrador pode conceder o papel ADMIN.",
    };
  }

  const activeAdminCount = await prisma.user.count({
    where: { role: "ADMIN", active: true },
  });
  const removesLastAdmin = wouldRemoveLastAdmin({
    targetIsAdmin: targetRole === "ADMIN",
    targetIsActive: target.active,
    activeAdminCount,
    nextRole: role,
    nextActive: active,
  });
  if (removesLastAdmin) {
    return {
      status: "error",
      message: "Não é possível rebaixar ou desativar o único administrador ativo.",
    };
  }

  const before = {
    name: target.name,
    role: target.role,
    active: target.active,
    setorIds: target.setores.map((membership) => membership.setorId).sort(),
  };

  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
  const updated = await prisma.user.update({
    where: { id },
    data: {
      name,
      role,
      active,
      ...(passwordHash ? { passwordHash } : {}),
      setores: {
        deleteMany: {},
        create: setorIds.map((setorId) => ({ setor: { connect: { id: setorId } } })),
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      setores: { select: { setorId: true } },
    },
  });

  const after = {
    name: updated.name,
    role: updated.role,
    active: updated.active,
    setorIds: updated.setores.map((membership) => membership.setorId).sort(),
    ...(password ? { passwordChanged: true } : {}),
  };

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "user.update",
    entity: "User",
    entityId: updated.id,
    summary: `Atualizou o usuário ${updated.name} (${updated.email}).${
      password ? " Senha redefinida." : ""
    }`,
    before,
    after,
    req: await requestHeaders(),
  });

  revalidatePath("/usuarios");
  return { status: "success", message: `Usuário ${updated.name} atualizado com sucesso.` };
}

const deleteUserSchema = z.object({ id: z.string().trim().min(1) });

// Exclusão de usuário (ADMIN/GESTOR). Trava para preservar integridade/auditoria:
// não exclui a si mesmo, não exclui o único admin ativo, e não faz "hard delete"
// de quem já tem histórico (imports/requisições) — nesse caso orienta a DESATIVAR
// (o soft-delete via edição), que mantém os registros ligados à pessoa.
export async function excluirUsuario(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return unauthenticated();
  }

  const actorRole = session.user.role;
  const permissions = await getRolePermissionsMap();
  if (!canManageUsers(actorRole, permissions)) {
    return { status: "error", message: "Você não tem permissão para excluir usuários." };
  }

  const parsed = deleteUserSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { status: "error", message: "Usuário inválido." };
  }
  const { id } = parsed.data;

  if (id === session.user.id) {
    return { status: "error", message: "Você não pode excluir a si mesmo." };
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      _count: {
        select: { imports: true, requisicoesFeitas: true, requisicoesGeridas: true, baixas: true },
      },
    },
  });
  if (!target) {
    return { status: "error", message: "Usuário não encontrado." };
  }

  const targetRole = target.role as Role;
  if (!canEditUser(actorRole, targetRole, permissions)) {
    return { status: "error", message: "Apenas um Administrador pode excluir um Administrador." };
  }

  if (targetRole === "ADMIN" && target.active) {
    const activeAdminCount = await prisma.user.count({ where: { role: "ADMIN", active: true } });
    if (activeAdminCount <= 1) {
      return { status: "error", message: "Não é possível excluir o único administrador ativo." };
    }
  }

  const temHistorico =
    target._count.imports > 0 ||
    target._count.requisicoesFeitas > 0 ||
    target._count.requisicoesGeridas > 0 ||
    target._count.baixas > 0;
  if (temHistorico) {
    return {
      status: "error",
      message:
        "Este usuário tem histórico (importações, requisições ou baixas de estoque). Para preservar " +
        "a auditoria, desative-o (Editar → desmarcar \"Usuário ativo\") em vez de excluir.",
    };
  }

  await prisma.user.delete({ where: { id } });

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "user.delete",
    entity: "User",
    entityId: id,
    summary: `Excluiu o usuário ${target.name} (${target.email}).`,
    before: { name: target.name, email: target.email, role: target.role, active: target.active },
    req: await requestHeaders(),
  });

  revalidatePath("/usuarios");
  return { status: "success", message: `Usuário ${target.name} excluído.` };
}

const createSetorSchema = z.object({ nome: z.string().trim().min(1) });

// Criação de setor (ADMIN/GESTOR) — o gestor precisa para associar usuários.
export async function createSetor(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return unauthenticated();
  }

  const actorRole = session.user.role;
  const permissions = await getRolePermissionsMap();
  if (!canManageUsers(actorRole, permissions)) {
    return { status: "error", message: "Você não tem permissão para criar setores." };
  }

  const parsed = createSetorSchema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) {
    return { status: "error", message: firstIssueMessage(parsed.error) };
  }

  const { nome } = parsed.data;
  const existing = await prisma.setor.findUnique({ where: { nome }, select: { id: true } });
  if (existing) {
    return { status: "error", message: `O setor "${nome}" já existe.` };
  }

  const created = await prisma.setor.create({ data: { nome }, select: { id: true, nome: true } });

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "setor.create",
    entity: "Setor",
    entityId: created.id,
    summary: `Criou o setor ${created.nome}.`,
    after: created,
    req: await requestHeaders(),
  });

  revalidatePath("/usuarios");
  revalidatePath("/configuracoes");
  return { status: "success", message: `Setor ${created.nome} criado com sucesso.` };
}

const deleteSetorSchema = z.object({ id: z.string().trim().min(1) });

// Exclusão de setor (ADMIN/GESTOR). Bloqueia se houver requisições ligadas a ele
// (a FK barra e a auditoria precisa do vínculo); as associações de usuários
// (UserSetor) somem em cascata. Não é "hard delete" de nada com histórico.
export async function excluirSetor(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.email) {
    return unauthenticated();
  }

  const permissions = await getRolePermissionsMap();
  if (!canManageUsers(session.user.role, permissions)) {
    return { status: "error", message: "Você não tem permissão para excluir setores." };
  }

  const parsed = deleteSetorSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { status: "error", message: "Setor inválido." };
  }
  const { id } = parsed.data;

  const target = await prisma.setor.findUnique({
    where: { id },
    select: { id: true, nome: true, _count: { select: { requisicoes: true, membros: true } } },
  });
  if (!target) {
    return { status: "error", message: "Setor não encontrado." };
  }
  if (target._count.requisicoes > 0) {
    return {
      status: "error",
      message: `O setor "${target.nome}" tem requisições ligadas a ele e não pode ser excluído (preserva o histórico). Renomeie-o se precisar.`,
    };
  }

  try {
    await prisma.setor.delete({ where: { id } });
  } catch {
    // Corrida rara (uma requisição passou a usar o setor entre a checagem e o
    // delete) → a FK barra. Mensagem amigável em vez de erro 500.
    return { status: "error", message: `Não consegui excluir o setor "${target.nome}" — pode ter passado a ser usado. Tente de novo.` };
  }

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "setor.delete",
    entity: "Setor",
    entityId: id,
    summary: `Excluiu o setor ${target.nome}.`,
    before: { nome: target.nome, membros: target._count.membros },
    req: await requestHeaders(),
  });

  revalidatePath("/usuarios");
  revalidatePath("/configuracoes");
  return { status: "success", message: `Setor ${target.nome} excluído.` };
}

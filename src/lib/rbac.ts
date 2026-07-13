import type { Role } from "@/lib/contracts";
import { hasModuleAccess, type RolePermissionsMap } from "@/lib/permissions";

// Predicados de papel (RBAC) — fonte única de verdade da autorização de Fase 1.
// Usados TANTO na UI (esconder no menu) QUANTO nos guards das páginas e server
// actions (bloquear de verdade). Puros e testáveis (recebem o mapa de
// permissões já resolvido — quem toca o banco é `getRolePermissionsMap`).
//
// Guards que continuam fixos em código (não configuráveis pela tela de
// permissões): só ADMIN concede o papel ADMIN e só ADMIN edita outro ADMIN.

// Admin e Gestor (por padrão) podem criar/listar usuários e setores — agora
// configurável por papel via RolePermission (módulo "users").
export function canManageUsers(role: Role, permissions: RolePermissionsMap): boolean {
  return hasModuleAccess(role, "users", permissions);
}

// Admin e Gestor (por padrão) veem a auditoria — módulo "audit".
export function canViewAudit(role: Role, permissions: RolePermissionsMap): boolean {
  return hasModuleAccess(role, "audit", permissions);
}

// Pranchas tem permissão própria para que o administrador possa liberar a
// compilação de desenhos sem também conceder acesso ao módulo Produtos.
export function canViewPranchas(role: Role, permissions: RolePermissionsMap): boolean {
  return hasModuleAccess(role, "pranchas", permissions);
}

// Só o ADMIN pode conceder o papel ADMIN — um Gestor não promove ninguém a dono.
// Regra de segurança fixa em código, independente da tela de permissões.
export function canAssignRole(actorRole: Role, targetRole: Role, permissions: RolePermissionsMap): boolean {
  if (targetRole === "ADMIN") {
    return actorRole === "ADMIN";
  }
  return canManageUsers(actorRole, permissions);
}

// Quem pode editar um usuário existente. Além do acesso ao módulo "users", um
// GESTOR NÃO pode editar um usuário ADMIN — só outro ADMIN mexe em quem é dono
// (regra fixa em código).
export function canEditUser(actorRole: Role, targetRole: Role, permissions: RolePermissionsMap): boolean {
  if (!canManageUsers(actorRole, permissions)) {
    return false;
  }
  if (targetRole === "ADMIN") {
    return actorRole === "ADMIN";
  }
  return true;
}

export interface LastAdminGuardInput {
  targetIsAdmin: boolean; // o usuário-alvo é ADMIN hoje?
  targetIsActive: boolean; // o usuário-alvo está ativo hoje?
  activeAdminCount: number; // total de ADMINs ativos hoje (inclui o alvo)
  nextRole: Role; // papel após a edição
  nextActive: boolean; // ativo após a edição
}

// Evita deixar a plataforma sem nenhum administrador ativo: bloqueia rebaixar ou
// desativar o último ADMIN ativo. Puro (recebe a contagem) para ser testável.
export function wouldRemoveLastAdmin(input: LastAdminGuardInput): boolean {
  const staysActiveAdmin = input.nextRole === "ADMIN" && input.nextActive;
  if (staysActiveAdmin) {
    return false;
  }
  const targetCountsToday = input.targetIsAdmin && input.targetIsActive;
  if (!targetCountsToday) {
    return false;
  }
  return input.activeAdminCount <= 1;
}

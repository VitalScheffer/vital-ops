import type { Role } from "@/lib/contracts";
import type { RolePermissionsMap } from "@/lib/permissions";

export interface UsuarioParaNotificar {
  id: string;
  role: string;
  active: boolean;
}

// Filtra quem deve receber o push a partir de uma lista de usuários já
// carregada (a Server Action busca no banco) + o mapa de permissões + o
// predicado RBAC (canDecideRequisicao, canViewProjetos...). Puro e testável:
// quem toca o banco é a Server Action, que chama isto depois.
export function idsParaNotificar(
  usuarios: readonly UsuarioParaNotificar[],
  permissions: RolePermissionsMap,
  pode: (role: Role, permissions: RolePermissionsMap) => boolean,
  opts?: { excluirId?: string | null },
): string[] {
  return usuarios
    .filter((u) => u.active)
    .filter((u) => u.id !== opts?.excluirId)
    .filter((u) => pode(u.role as Role, permissions))
    .map((u) => u.id);
}

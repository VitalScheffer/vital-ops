import type { Role } from "@/lib/contracts";

// Permissões configuráveis por papel × módulo (item 3). Fonte única de
// verdade da tabela `RolePermission`, consultada por rbac.ts/navigation.ts em
// vez do antigo array fixo `PRIVILEGED_ROLES`. Lógica de montagem do mapa é
// pura/testável; a consulta ao banco vive em `permissions.server.ts` para este
// módulo NÃO importar `@/lib/db` — assim componentes cliente (que usam MODULES
// e os tipos daqui) não arrastam o driver `pg` para o bundle do navegador.

export const MODULES = ["products", "users", "audit"] as const;
export type Module = (typeof MODULES)[number];

export type RolePermissionsMap = Record<Role, Record<Module, boolean>>;

// Comportamento hoje vigente, preservado como padrão: ADMIN e GESTOR têm tudo,
// FUNCIONARIO só Produtos. Usado como seed E como fallback para qualquer
// combinação papel×módulo ainda sem linha no banco.
export const DEFAULT_ROLE_PERMISSIONS: RolePermissionsMap = {
  ADMIN: { products: true, users: true, audit: true },
  GESTOR: { products: true, users: true, audit: true },
  FUNCIONARIO: { products: true, users: false, audit: false },
};

const ROLES: readonly Role[] = ["ADMIN", "GESTOR", "FUNCIONARIO"];

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

function isModule(value: string): value is Module {
  return (MODULES as readonly string[]).includes(value);
}

export interface RolePermissionRow {
  role: string;
  module: string;
  enabled: boolean;
}

// Monta o mapa papel×módulo a partir das linhas do banco. Linhas ausentes ou
// com role/module desconhecido caem no padrão. ADMIN é travado em `true` em
// TODO módulo — regra de segurança em código, não configurável pela tela.
export function buildRolePermissionsMap(rows: readonly RolePermissionRow[]): RolePermissionsMap {
  const map: RolePermissionsMap = {
    ADMIN: { ...DEFAULT_ROLE_PERMISSIONS.ADMIN },
    GESTOR: { ...DEFAULT_ROLE_PERMISSIONS.GESTOR },
    FUNCIONARIO: { ...DEFAULT_ROLE_PERMISSIONS.FUNCIONARIO },
  };

  for (const row of rows) {
    if (!isRole(row.role) || !isModule(row.module)) {
      continue;
    }
    map[row.role][row.module] = row.enabled;
  }

  for (const mod of MODULES) {
    map.ADMIN[mod] = true;
  }

  return map;
}

export function hasModuleAccess(role: Role, module: Module, permissions: RolePermissionsMap): boolean {
  return permissions[role]?.[module] ?? false;
}

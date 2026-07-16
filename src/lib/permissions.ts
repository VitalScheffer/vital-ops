import type { Role } from "@/lib/contracts";

// Permissões configuráveis por papel × módulo (item 3). Fonte única de
// verdade da tabela `RolePermission`, consultada por rbac.ts/navigation.ts em
// vez do antigo array fixo `PRIVILEGED_ROLES`. Lógica de montagem do mapa é
// pura/testável; a consulta ao banco vive em `permissions.server.ts` para este
// módulo NÃO importar `@/lib/db` — assim componentes cliente (que usam MODULES
// e os tipos daqui) não arrastam o driver `pg` para o bundle do navegador.

export const MODULES = ["products", "pranchas", "requisicoes", "baixas", "users", "audit"] as const;
export type Module = (typeof MODULES)[number];

export type RolePermissionsMap = Record<Role, Record<Module, boolean>>;

// Padrões: ADMIN e GESTOR têm tudo; FUNCIONARIO tem os módulos operacionais
// (Produtos, Pranchas, Requisições, Baixas) mas não Usuários/Auditoria; FABRICA
// (chão de fábrica, só solicita) e FABRICA_GESTOR (aprova os pedidos) veem SÓ
// Requisições. Usado como seed E como fallback para qualquer combinação
// papel×módulo ainda sem linha no banco.
export const DEFAULT_ROLE_PERMISSIONS: RolePermissionsMap = {
  ADMIN: { products: true, pranchas: true, requisicoes: true, baixas: true, users: true, audit: true },
  GESTOR: { products: true, pranchas: true, requisicoes: true, baixas: true, users: true, audit: true },
  FUNCIONARIO: { products: true, pranchas: true, requisicoes: true, baixas: true, users: false, audit: false },
  FABRICA: { products: false, pranchas: false, requisicoes: true, baixas: false, users: false, audit: false },
  FABRICA_GESTOR: { products: false, pranchas: false, requisicoes: true, baixas: false, users: false, audit: false },
};

const ROLES: readonly Role[] = ["ADMIN", "GESTOR", "FUNCIONARIO", "FABRICA", "FABRICA_GESTOR"];

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
    FABRICA: { ...DEFAULT_ROLE_PERMISSIONS.FABRICA },
    FABRICA_GESTOR: { ...DEFAULT_ROLE_PERMISSIONS.FABRICA_GESTOR },
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

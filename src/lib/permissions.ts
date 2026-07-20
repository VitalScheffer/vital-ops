import { PAPEIS_FIXOS, ROTULO_PAPEL_FIXO, type Role } from "@/lib/contracts";

// Permissões por papel × módulo (item 3). Fonte única de verdade da tabela
// `RolePermission`, consultada por rbac.ts/navigation.ts. Lógica de montagem do
// mapa é pura/testável; a consulta ao banco vive em `permissions.server.ts` para
// este módulo NÃO importar `@/lib/db` (assim componentes cliente que usam MODULES
// não arrastam o driver `pg` para o bundle do navegador).
//
// "Papel" aqui é o `codigo`: um dos 5 fixos (ADMIN/GESTOR/...) OU o codigo de um
// perfil customizado (cuid). Perfis customizados começam sem nenhum módulo e são
// marcados na matriz; não têm poderes especiais (decidir/relatórios são só dos
// fixos).

export const MODULES = ["products", "pranchas", "requisicoes", "baixas", "users", "audit"] as const;
export type Module = (typeof MODULES)[number];

export type RolePermissionsMap = Record<string, Record<Module, boolean>>;

// Padrões dos papéis FIXOS: ADMIN e GESTOR têm tudo; FUNCIONARIO tem os módulos
// operacionais menos Usuários/Auditoria; FABRICA e FABRICA_GESTOR veem SÓ
// Requisições. Seed E fallback de qualquer combinação ainda sem linha no banco.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<Module, boolean>> = {
  ADMIN: { products: true, pranchas: true, requisicoes: true, baixas: true, users: true, audit: true },
  GESTOR: { products: true, pranchas: true, requisicoes: true, baixas: true, users: true, audit: true },
  FUNCIONARIO: { products: true, pranchas: true, requisicoes: true, baixas: true, users: false, audit: false },
  FABRICA: { products: false, pranchas: false, requisicoes: true, baixas: false, users: false, audit: false },
  FABRICA_GESTOR: { products: false, pranchas: false, requisicoes: true, baixas: false, users: false, audit: false },
};

function moduloVazio(): Record<Module, boolean> {
  return { products: false, pranchas: false, requisicoes: false, baixas: false, users: false, audit: false };
}

function isModule(value: string): value is Module {
  return (MODULES as readonly string[]).includes(value);
}

export interface RolePermissionRow {
  role: string;
  module: string;
  enabled: boolean;
}

// Monta o mapa papel×módulo. Os 5 fixos entram com seus defaults; os perfis
// customizados (`perfisCustom` = seus codigos) entram com tudo desmarcado. Depois
// aplica as linhas do banco por cima. ADMIN é travado em `true` em TODO módulo
// (regra de segurança em código, não configurável pela tela).
export function buildRolePermissionsMap(
  rows: readonly RolePermissionRow[],
  perfisCustom: readonly string[] = [],
): RolePermissionsMap {
  const map: RolePermissionsMap = {};
  for (const papel of PAPEIS_FIXOS) {
    map[papel] = { ...DEFAULT_ROLE_PERMISSIONS[papel] };
  }
  for (const codigo of perfisCustom) {
    if (!map[codigo]) map[codigo] = moduloVazio();
  }

  for (const row of rows) {
    if (!isModule(row.module)) continue;
    const alvo = map[row.role];
    if (alvo) alvo[row.module] = row.enabled;
  }

  for (const mod of MODULES) map.ADMIN[mod] = true;

  return map;
}

export function hasModuleAccess(role: Role, module: Module, permissions: RolePermissionsMap): boolean {
  return permissions[role]?.[module] ?? false;
}

// Um papel na matriz/dropdown: os 5 fixos (fixo=true, não apaga) + os perfis
// customizados do banco (fixo=false). `codigo` = o valor de User.role.
export interface PerfilView {
  codigo: string;
  nome: string;
  fixo: boolean;
}

export const PERFIS_FIXOS: readonly PerfilView[] = PAPEIS_FIXOS.map((codigo) => ({
  codigo,
  nome: ROTULO_PAPEL_FIXO[codigo],
  fixo: true,
}));

// Rótulo de um papel: nome do fixo, ou o nome do perfil customizado (do mapa),
// ou o próprio código como último recurso.
export function rotuloPapel(codigo: string, nomesCustom: Record<string, string> = {}): string {
  const fixo = PERFIS_FIXOS.find((p) => p.codigo === codigo);
  return fixo?.nome ?? nomesCustom[codigo] ?? codigo;
}

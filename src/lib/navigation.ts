import type { Role } from "@/lib/contracts";
import { hasModuleAccess, type RolePermissionsMap } from "@/lib/permissions";
import { canManageUsers, canViewAudit } from "@/lib/rbac";

// Chaves de ícone (mapeadas para SVGs do lucide no componente cliente da barra).
export type NavIcon = "home" | "products" | "users" | "audit" | "settings";

export interface NavItem {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: NavIcon;
  // Predicado de visibilidade por papel — mesma regra do guard da página.
  // Recebe o mapa de permissões já resolvido (item 3: RolePermission).
  visibleTo: (role: Role, permissions: RolePermissionsMap) => boolean;
}

// Versão serializável (sem função) para passar do Server Component para o cliente.
export type PublicNavItem = Omit<NavItem, "visibleTo">;

const alwaysVisible = (): boolean => true;
// Tela de permissões: só ADMIN, sempre — regra fixa em código (não dá pra um
// admin se autoexcluir daqui, senão ninguém mais consegue reconfigurar nada).
const adminOnly = (role: Role): boolean => role === "ADMIN";

// Navegação: Início para todos; Produtos/Usuários/Auditoria seguem o módulo
// configurado em RolePermission; Configurações é fixo para ADMIN.
export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "home",
    href: "/",
    label: "Início",
    description: "Visão geral e atalhos dos seus módulos.",
    icon: "home",
    visibleTo: alwaysVisible,
  },
  {
    key: "produtos",
    href: "/produtos",
    label: "Produtos",
    description: "Converta a BOM do CAD na planilha de importação de produtos do Omie.",
    icon: "products",
    visibleTo: (role, permissions) => hasModuleAccess(role, "products", permissions),
  },
  {
    key: "usuarios",
    href: "/usuarios",
    label: "Usuários e setores",
    description: "Cadastre pessoas, defina papéis e organize os setores.",
    icon: "users",
    visibleTo: canManageUsers,
  },
  {
    key: "auditoria",
    href: "/auditoria",
    label: "Auditoria",
    description: "Histórico de quem fez o quê, quando e de onde.",
    icon: "audit",
    visibleTo: canViewAudit,
  },
  {
    key: "configuracoes",
    href: "/configuracoes",
    label: "Configurações",
    description: "Escolha quais módulos cada papel pode acessar.",
    icon: "settings",
    visibleTo: adminOnly,
  },
];

function toPublic(item: NavItem): PublicNavItem {
  return {
    key: item.key,
    href: item.href,
    label: item.label,
    description: item.description,
    icon: item.icon,
  };
}

// Itens de navegação que o papel pode ver (já serializáveis para o cliente).
export function visibleNavFor(role: Role, permissions: RolePermissionsMap): PublicNavItem[] {
  return NAV_ITEMS.filter((item) => item.visibleTo(role, permissions)).map(toPublic);
}

import type { Role } from "@/lib/contracts";
import { hasModuleAccess, type RolePermissionsMap } from "@/lib/permissions";
import {
  canManageUsers,
  canViewAudit,
  canViewBaixas,
  canViewConfigurador,
  canViewProjetos,
  canViewRequisicoes,
} from "@/lib/rbac";

// Chaves de ícone (mapeadas para SVGs do lucide no componente cliente da barra).
export type NavIcon =
  | "home"
  | "products"
  | "pranchas"
  | "configurador"
  | "projetos"
  | "requisicoes"
  | "baixas"
  | "users"
  | "audit"
  | "settings";

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

// Navegação: Início para todos; Produtos/Pranchas/Usuários/Auditoria seguem o módulo
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
    key: "pranchas",
    href: "/pranchas",
    label: "Pranchas",
    description: "Junte os desenhos de um conjunto num PDF único pronto para imprimir.",
    icon: "pranchas",
    visibleTo: (role, permissions) => hasModuleAccess(role, "pranchas", permissions),
  },
  {
    key: "configurador",
    href: "/configurador",
    label: "Configurador",
    description: "Monte o produto opção por opção e envie a especificação para a equipe de Projetos.",
    icon: "configurador",
    visibleTo: canViewConfigurador,
  },
  {
    key: "projetos",
    href: "/projetos",
    label: "Projetos",
    description: "Fila das configurações enviadas pelo comercial: responda com o número do projeto.",
    icon: "projetos",
    visibleTo: canViewProjetos,
  },
  {
    key: "requisicoes",
    href: "/requisicoes",
    label: "Requisições",
    description: "Peça material ao estoque; o gestor confirma e a baixa sai sozinha.",
    icon: "requisicoes",
    visibleTo: canViewRequisicoes,
  },
  {
    key: "baixas",
    href: "/baixas",
    label: "Baixa de estoque",
    description: "Suba a planilha de matéria-prima (MAT) e dê baixa direto no Omie.",
    icon: "baixas",
    visibleTo: canViewBaixas,
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

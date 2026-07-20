import { prisma } from "@/lib/db";
import {
  PERFIS_FIXOS,
  buildRolePermissionsMap,
  type PerfilView,
  type RolePermissionsMap,
} from "@/lib/permissions";

// Único ponto que consulta o banco de permissões/perfis. Fica separado de
// `permissions.ts` (puro) porque importa `@/lib/db` (Prisma + driver `pg`):
// mantê-lo aqui impede que componentes cliente arrastem o `pg` para o bundle.
export async function getRolePermissionsMap(): Promise<RolePermissionsMap> {
  const [rows, perfis] = await Promise.all([
    prisma.rolePermission.findMany(),
    prisma.perfil.findMany({ select: { codigo: true } }),
  ]);
  return buildRolePermissionsMap(
    rows,
    perfis.map((p) => p.codigo),
  );
}

// Todos os papéis para a matriz/dropdown: os 5 fixos + os perfis customizados.
export async function listarPerfis(): Promise<PerfilView[]> {
  const custom = await prisma.perfil.findMany({
    orderBy: { nome: "asc" },
    select: { codigo: true, nome: true },
  });
  return [...PERFIS_FIXOS, ...custom.map((p) => ({ codigo: p.codigo, nome: p.nome, fixo: false }))];
}

// Mapa codigo→nome só dos perfis customizados (para resolver rótulos onde só
// temos o codigo do User.role).
export async function nomesPerfisCustom(): Promise<Record<string, string>> {
  const custom = await prisma.perfil.findMany({ select: { codigo: true, nome: true } });
  return Object.fromEntries(custom.map((p) => [p.codigo, p.nome]));
}

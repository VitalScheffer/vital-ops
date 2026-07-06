import { prisma } from "@/lib/db";
import { buildRolePermissionsMap, type RolePermissionsMap } from "@/lib/permissions";

// Único ponto que consulta o banco de permissões. Fica separado de
// `permissions.ts` (puro) porque importa `@/lib/db` (Prisma + driver `pg`):
// mantê-lo aqui impede que componentes cliente — que só precisam de MODULES e
// dos tipos de `permissions.ts` — arrastem o `pg` para o bundle do navegador.
export async function getRolePermissionsMap(): Promise<RolePermissionsMap> {
  const rows = await prisma.rolePermission.findMany();
  return buildRolePermissionsMap(rows);
}

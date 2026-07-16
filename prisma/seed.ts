import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Seed idempotente (upsert): 1 ADMIN + 1 GESTOR com senha padrão de dev.
// Rode com `npm run db:seed` (após `prisma migrate dev`). Reexecutar reaplica
// nome/papel/senha padrão (útil no dev). Não use estas senhas em produção.

const DATABASE_URL = process.env.DATABASE_URL!;
const DEFAULT_PASSWORD = "vital123";

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface SeedUser {
  email: string;
  name: string;
  role: string;
}

const USERS: SeedUser[] = [
  { email: "admin@vitalscheffer.com.br", name: "Administrador", role: "ADMIN" },
  { email: "gestor@vitalscheffer.com.br", name: "Gestor", role: "GESTOR" },
];

// Permissões padrão (item 3 — RolePermission). Espelha DEFAULT_ROLE_PERMISSIONS
// de src/lib/permissions.ts: ADMIN/GESTOR = tudo; FUNCIONARIO = módulos
// operacionais; FABRICA (chão de fábrica) = só Requisições.
const DEFAULT_PERMISSIONS: { role: string; module: string; enabled: boolean }[] = [
  { role: "ADMIN", module: "products", enabled: true },
  { role: "ADMIN", module: "pranchas", enabled: true },
  { role: "ADMIN", module: "requisicoes", enabled: true },
  { role: "ADMIN", module: "baixas", enabled: true },
  { role: "ADMIN", module: "users", enabled: true },
  { role: "ADMIN", module: "audit", enabled: true },
  { role: "GESTOR", module: "products", enabled: true },
  { role: "GESTOR", module: "pranchas", enabled: true },
  { role: "GESTOR", module: "requisicoes", enabled: true },
  { role: "GESTOR", module: "baixas", enabled: true },
  { role: "GESTOR", module: "users", enabled: true },
  { role: "GESTOR", module: "audit", enabled: true },
  { role: "FUNCIONARIO", module: "products", enabled: true },
  { role: "FUNCIONARIO", module: "pranchas", enabled: true },
  { role: "FUNCIONARIO", module: "requisicoes", enabled: true },
  { role: "FUNCIONARIO", module: "baixas", enabled: true },
  { role: "FUNCIONARIO", module: "users", enabled: false },
  { role: "FUNCIONARIO", module: "audit", enabled: false },
  { role: "FABRICA", module: "products", enabled: false },
  { role: "FABRICA", module: "pranchas", enabled: false },
  { role: "FABRICA", module: "requisicoes", enabled: true },
  { role: "FABRICA", module: "baixas", enabled: false },
  { role: "FABRICA", module: "users", enabled: false },
  { role: "FABRICA", module: "audit", enabled: false },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        active: true,
        passwordHash,
      },
      update: {
        name: user.name,
        role: user.role,
        active: true,
        passwordHash,
      },
    });
    console.log(`Seed: ${user.role} ${user.email} (senha: ${DEFAULT_PASSWORD})`);
  }

  for (const permission of DEFAULT_PERMISSIONS) {
    await prisma.rolePermission.upsert({
      where: { role_module: { role: permission.role, module: permission.module } },
      create: permission,
      // Só cria se não existir: reaplicar o seed não deve apagar mudanças que
      // o admin já fez na tela de Configurações.
      update: {},
    });
  }
  console.log("Seed: permissões padrão garantidas (RolePermission).");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

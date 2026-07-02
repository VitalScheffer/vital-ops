import path from "node:path";
import { defineConfig } from "prisma/config";
import "dotenv/config";

// Prisma 7: a URL de conexão (usada por migrate/introspect) fica aqui, não no
// schema. O runtime usa o driver adapter em src/lib/db.ts. Produção = PostgreSQL.
// O config file NÃO carrega .env sozinho (diferente do CLI clássico) — por isso
// o import "dotenv/config" acima, explícito.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/vitalops",
  },
});

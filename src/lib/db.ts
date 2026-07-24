import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Singleton do PrismaClient (evita abrir várias conexões no dev/HMR).
// Prisma 7 usa driver adapter; produção roda em PostgreSQL (@prisma/adapter-pg).
const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      // TLS exigido AQUI, e não pelo `sslmode` da string de conexão.
      //
      // A string mora numa variável de ambiente marcada como sensível na
      // Vercel: ninguém consegue ler o valor depois de salvo, nem a gente nem
      // quem for revisar. Deixar a garantia de transporte pendurada num texto
      // que não dá para inspecionar é apostar que ninguém colou a URL errada
      // um dia. Aqui a exigência fica versionada e revisável.
      //
      // `rejectUnauthorized: true` faz o Node validar a cadeia do certificado E
      // o hostname, que é o equivalente ao `sslmode=verify-full` do libpq. Sem
      // isso, um `sslmode=require` sozinho cifra o tráfego mas aceita qualquer
      // certificado, o que não protege contra alguém no meio do caminho.
      ssl: { rejectUnauthorized: true },
    }),
  });

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

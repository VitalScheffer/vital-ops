import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma 7 (driver adapter pg) roda no servidor; não deve
  // ser empacotado pelo bundler das Server Components/Route Handlers.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;

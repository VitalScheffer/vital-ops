import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    // A edição cirúrgica do template do Omie descompacta/recompacta um .xlsx de
    // ~4,4 MB (13 abas + imagens). Alguns testes fazem isso duas vezes em
    // sequência, o que ultrapassa o timeout padrão de 5s em máquinas mais lentas.
    testTimeout: 30000,
  },
  resolve: {
    // Alias "@/..." → "src/..." (mesmo do tsconfig) para os testes que
    // importam módulos da aplicação.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

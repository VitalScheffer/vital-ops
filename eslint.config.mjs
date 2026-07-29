import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts Node/CJS da revisão de PR (não são código da aplicação;
    // testados com `node --test .github/scripts/lib/*.test.js`).
    ".github/scripts/**",
    // Worker minificado do pdfjs (vendor copiado de node_modules pro módulo
    // Pranchas) — não é código nosso, não faz sentido lintar.
    "public/pdf.worker.min.mjs",
    // Service worker do Web Push: script clássico (não-módulo), roda no
    // escopo global do worker (self/clients/caches) — fora do escopo de
    // módulo que o eslint-config-next assume para o resto do projeto.
    "public/sw.js",
  ]),
]);

export default eslintConfig;

// Configuração do client Omie a partir do ambiente (Vercel/env).

// Limpa um valor vindo do ambiente. Em produção (Vercel) o valor entra CRU: se
// foi salvo com aspas, BOM (U+FEFF) ou espaço/quebra de linha, esse lixo vai
// junto. Na URL isso dava "Failed to parse URL"; na chave de acesso o Omie
// rejeita como "chave inválida". Tiramos tudo isso antes de usar.
function limparEnv(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "") // BOM invisível no começo
    .trim() // espaços e quebras de linha nas pontas
    .replace(/^["']|["']$/g, ""); // aspas acidentais em volta do valor
}

function limparUrlBase(raw: string): string {
  return limparEnv(raw).replace(/\/+$/, ""); // tira também a barra final
}

export const OMIE_BASE_URL = limparUrlBase(
  process.env.OMIE_BASE_URL ?? "https://app.omie.com.br/api/v1",
);
export const OMIE_TIMEOUT_MS = Number(process.env.OMIE_TIMEOUT_MS ?? 20000);

export interface OmieCredentials {
  appKey: string;
  appSecret: string;
}

// Credenciais PRÓPRIAS da plataforma. Limpa aspas/BOM/espaço (a env var em prod
// entra crua) e falha cedo se não configuradas.
export function omieCredentials(): OmieCredentials {
  const appKey = limparEnv(process.env.OMIE_APP_KEY ?? "");
  const appSecret = limparEnv(process.env.OMIE_APP_SECRET ?? "");
  if (!appKey || !appSecret) {
    throw new Error("OMIE_APP_KEY/OMIE_APP_SECRET não configurados no ambiente.");
  }
  return { appKey, appSecret };
}

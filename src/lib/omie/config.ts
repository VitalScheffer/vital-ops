// Configuração do client Omie a partir do ambiente (Vercel/env).

// Limpa a URL base. Em produção (Vercel) o valor da env var entra CRU: se foi
// salvo com aspas, BOM (U+FEFF) ou espaço/quebra de linha, a URL final fica
// impossível de parsear ("Failed to parse URL"). Tiramos esse lixo antes de usar.
function limparUrlBase(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "") // BOM invisível no começo
    .trim() // espaços e quebras de linha nas pontas
    .replace(/^["']|["']$/g, "") // aspas acidentais em volta do valor
    .replace(/\/+$/, ""); // barra(s) final(is)
}

export const OMIE_BASE_URL = limparUrlBase(
  process.env.OMIE_BASE_URL ?? "https://app.omie.com.br/api/v1",
);
export const OMIE_TIMEOUT_MS = Number(process.env.OMIE_TIMEOUT_MS ?? 20000);

export interface OmieCredentials {
  appKey: string;
  appSecret: string;
}

// Credenciais PRÓPRIAS da plataforma. Falha cedo (local) se não configuradas:
// não faz sentido bater no Omie sem elas.
export function omieCredentials(): OmieCredentials {
  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("OMIE_APP_KEY/OMIE_APP_SECRET não configurados no ambiente.");
  }
  return { appKey, appSecret };
}

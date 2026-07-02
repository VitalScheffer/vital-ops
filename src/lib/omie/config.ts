// Configuração do client Omie a partir do ambiente (Vercel/env).

export const OMIE_BASE_URL = process.env.OMIE_BASE_URL ?? "https://app.omie.com.br/api/v1";
export const OMIE_TIMEOUT_MS = Number(process.env.OMIE_TIMEOUT_MS ?? 20000);

export interface OmieCredentials {
  appKey: string;
  appSecret: string;
}

// Credenciais PRÓPRIAS da plataforma. Falha cedo (local) se não configuradas —
// não faz sentido bater no Omie sem elas.
export function omieCredentials(): OmieCredentials {
  const appKey = process.env.OMIE_APP_KEY;
  const appSecret = process.env.OMIE_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("OMIE_APP_KEY/OMIE_APP_SECRET não configurados no ambiente.");
  }
  return { appKey, appSecret };
}

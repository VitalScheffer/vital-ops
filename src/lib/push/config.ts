// Configuração do Web Push a partir do ambiente (Vercel/env).

// Mesma limpeza do client Omie (src/lib/omie/config.ts): em produção a env var
// entra crua, e BOM/aspas/espaço quebram a chave. Duplicado aqui de propósito
// (é um helper de 4 linhas, não vale acoplar os dois módulos por isso).
const BOM = String.fromCharCode(0xfeff);

function limparEnv(raw: string): string {
  const semBom = raw.startsWith(BOM) ? raw.slice(BOM.length) : raw;
  return semBom.trim().replace(/^["']|["']$/g, "");
}

export interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

// true só quando as 3 variáveis estão presentes — usado para decidir se dá
// para tentar enviar push, sem lançar.
export function vapidConfigured(): boolean {
  return Boolean(
    limparEnv(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "") &&
      limparEnv(process.env.VAPID_PRIVATE_KEY ?? "") &&
      limparEnv(process.env.VAPID_SUBJECT ?? ""),
  );
}

// Lança se não configurado — só chamar depois de checar `vapidConfigured()`.
export function vapidDetails(): VapidDetails {
  const publicKey = limparEnv(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "");
  const privateKey = limparEnv(process.env.VAPID_PRIVATE_KEY ?? "");
  const subject = limparEnv(process.env.VAPID_SUBJECT ?? "");
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID não configurado (NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT).",
    );
  }
  return { subject, publicKey, privateKey };
}

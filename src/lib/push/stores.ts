import { prisma } from "@/lib/db";

export interface InscricaoInput {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string | null;
}

// Upsert por endpoint: o mesmo navegador pode assinar de novo (ex. reinstalou
// o perfil) sem duplicar linha, e o `userId` é REATRIBUÍDO no update — o
// endpoint é do NAVEGADOR, não da pessoa, então se outra pessoa logar no mesmo
// navegador depois, a assinatura passa a apontar para quem está logado agora.
export async function inscrever(input: InscricaoInput): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent,
    },
    update: {
      userId: input.userId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent,
    },
  });
}

// Idempotente: apagar o que já não existe (ou não é do usuário) devolve 0
// linhas afetadas, sem erro — o botão "desativar" não precisa saber qual caso é.
export async function desinscrever(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
}

export async function listarPorUsuarios(userIds: readonly string[]) {
  if (userIds.length === 0) return [];
  return prisma.pushSubscription.findMany({ where: { userId: { in: [...userIds] } } });
}

export async function removerExpiradas(endpoints: readonly string[]): Promise<void> {
  if (endpoints.length === 0) return;
  await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: [...endpoints] } } });
}

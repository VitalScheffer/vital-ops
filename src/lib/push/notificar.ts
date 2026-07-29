import { enviarPush } from "@/lib/push/client";
import { listarPorUsuarios, removerExpiradas } from "@/lib/push/stores";
import type { PushPayload } from "@/lib/push/types";

// Best-effort de ponta a ponta: NUNCA lança. Se o web-push, o banco ou o VAPID
// falharem aqui, a Server Action que chamou continua e devolve sucesso
// normalmente — mesmo raciocínio de `saldoDoProduto` em requisicoes/actions.ts.
export async function notificarUsuarios(userIds: readonly string[], payload: PushPayload): Promise<void> {
  try {
    if (userIds.length === 0) return;
    const subs = await listarPorUsuarios(userIds);
    if (subs.length === 0) return;

    const resultados = await Promise.allSettled(
      subs.map((sub) =>
        enviarPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload),
      ),
    );
    const expirados = subs
      .filter((_, indice) => {
        const resultado = resultados[indice];
        return resultado.status === "fulfilled" && !resultado.value.ok && resultado.value.expirado;
      })
      .map((sub) => sub.endpoint);
    await removerExpiradas(expirados);
  } catch {
    // best-effort — nunca propaga para a Server Action chamadora.
  }
}

export async function notificarUsuario(userId: string, payload: PushPayload): Promise<void> {
  await notificarUsuarios([userId], payload);
}

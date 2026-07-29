import webpush from "web-push";

import { vapidConfigured, vapidDetails } from "@/lib/push/config";
import type { PushPayload } from "@/lib/push/types";

export interface PushSubscriptionAlvo {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type EnvioPushResultado =
  | { ok: true }
  | { ok: false; expirado: boolean; erro: string };

// Uma única chamada = um endpoint. NUNCA lança — todo erro vira { ok: false }.
// expirado=true quando o serviço de push devolveu 404/410 (assinatura morta,
// dá para apagar em vez de tentar de novo).
export async function enviarPush(
  subscription: PushSubscriptionAlvo,
  payload: PushPayload,
): Promise<EnvioPushResultado> {
  if (!vapidConfigured()) {
    return { ok: false, expirado: false, erro: "VAPID não configurado" };
  }
  const { subject, publicKey, privateKey } = vapidDetails();
  webpush.setVapidDetails(subject, publicKey, privateKey);
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600 });
    return { ok: true };
  } catch (erro) {
    const status = (erro as { statusCode?: number }).statusCode;
    return { ok: false, expirado: status === 404 || status === 410, erro: String(erro) };
  }
}

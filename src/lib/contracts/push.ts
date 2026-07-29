import { z } from "zod";

// Corpo enviado pelo navegador ao assinar/desassinar o Web Push. `endpoint` é a
// URL do serviço de push do NAVEGADOR (identifica o dispositivo/navegador, não
// o usuário) — o `userAgent` não vem no corpo: a rota lê o header
// `user-agent` da própria requisição em vez de confiar no que o cliente manda.
export const pushSubscriptionKeysSchema = z.object({
  p256dh: z.string().trim().min(1),
  auth: z.string().trim().min(1),
});
export type PushSubscriptionKeysInput = z.infer<typeof pushSubscriptionKeysSchema>;

export const pushSubscribeSchema = z.object({
  endpoint: z.string().trim().min(1),
  keys: pushSubscriptionKeysSchema,
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1),
});
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;

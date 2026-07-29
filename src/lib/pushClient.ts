// Orquestração do Web Push NO NAVEGADOR (client-safe: nada de Prisma/web-push
// aqui — isso fica em src/lib/push/, server-only). Usado por
// NotificacoesBell.tsx. Fica como arquivo de topo, e não dentro de
// src/lib/push/, para a fronteira cliente×servidor nunca ficar ambígua —
// mesma separação de src/lib/permissions.ts × permissions.server.ts.

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export function suportaPushNotifications(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js");
}

function assinaturaParaApi(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint!,
    keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
  };
}

// Restaura o estado do toggle SEM pedir permissão nem registrar nada novo —
// chamado no mount do componente. Devolve null se não houver assinatura ativa.
export async function assinaturaAtual(): Promise<PushSubscription | null> {
  if (!suportaPushNotifications()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// SÓ deve ser chamado dentro de um onClick (gesto do usuário) — pedir
// permissão de notificação sem gesto é penalizado/silenciado por navegadores
// como o Chrome. Lança com mensagem em pt-BR amigável para o componente exibir.
export async function ativarNotificacoesPush(): Promise<void> {
  if (!suportaPushNotifications()) {
    throw new Error("Este navegador não suporta notificações.");
  }
  const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!chavePublica) {
    throw new Error("Notificações indisponíveis no momento.");
  }

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") {
    throw new Error("Permissão de notificação negada.");
  }

  const registration = await registrarServiceWorker();
  await navigator.serviceWorker.ready;

  const existente = await registration.pushManager.getSubscription();
  const subscription =
    existente ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(chavePublica),
    }));

  const resposta = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(assinaturaParaApi(subscription)),
  });
  if (!resposta.ok) {
    throw new Error("Não consegui salvar a assinatura no servidor.");
  }
}

export async function desativarNotificacoesPush(): Promise<void> {
  const subscription = await assinaturaAtual();
  if (!subscription) return;

  const { endpoint } = assinaturaParaApi(subscription);
  await subscription.unsubscribe();
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

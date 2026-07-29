// Service worker do Vital Ops — só existe para o Web Push (notificações
// "toast" do sistema, funcionando com a aba fora de foco ou fechada). Script
// clássico (não-módulo), servido cru de public/, sem passar por bundler/lint.

self.addEventListener("install", () => {
  // Ativa imediatamente: quem clicou em "Ativar notificações" agora mesmo não
  // deve precisar fechar todas as abas para o service worker valer.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let dados = { title: "Vital Ops", body: "Você tem uma novidade.", url: "/" };
  try {
    if (event.data) {
      dados = { ...dados, ...event.data.json() };
    }
  } catch {
    // payload não é JSON (não deveria acontecer, o servidor sempre manda
    // JSON) — segue com o texto padrão em vez de falhar o evento.
  }

  event.waitUntil(
    self.registration.showNotification(dados.title, {
      body: dados.body,
      tag: dados.tag,
      data: { url: dados.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existente = clientList.find((client) => {
        const clientUrl = new URL(client.url);
        return clientUrl.pathname === url;
      });
      if (existente) {
        await existente.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

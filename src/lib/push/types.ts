// Payload de UMA notificação push. Vira o corpo (JSON) que o service worker
// (public/sw.js) lê no evento `push` para montar o toast do sistema.
export interface PushPayload {
  title: string;
  body: string;
  url: string; // rota para abrir/focar ao clicar na notificação
  tag?: string; // agrupa/atualiza notificações da mesma entidade em vez de empilhar
}

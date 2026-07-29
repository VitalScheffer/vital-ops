// Barrel do módulo de Web Push (server-only: toca Prisma e o pacote
// `web-push`). Superfície estreita de propósito — `config.ts`/`client.ts`
// ficam de fora, igual ao `src/lib/omie/index.ts` só expor `chamar`.
export * from "./types";
export * from "./destinatarios";
export { notificarUsuario, notificarUsuarios } from "./notificar";
export { inscrever, desinscrever } from "./stores";

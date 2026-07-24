// Trava de força bruta no login.
//
// O `authorize` comparava a senha sem nenhum limite de tentativas: uma conta com
// senha fraca caía por repetição, e ninguém ficava sabendo (só o login que dava
// CERTO era auditado). Agora a falha também é auditada, e a própria auditoria é
// o contador: acima do teto na janela, a conta para de aceitar tentativa.
//
// Usar o AuditLog como contador é de propósito. Evita tabela e migração só para
// isso, e registrar a falha era coisa que faltava de qualquer jeito.

export const ACAO_FALHA_LOGIN = "auth.login_falhou";

// 10 tentativas em 15 minutos. Sobra folga para quem erra a senha de verdade
// (e para o gerenciador de senha tentar a antiga), e não sobra para script.
export const MAX_FALHAS_LOGIN = 10;
export const JANELA_FALHAS_MS = 15 * 60 * 1000;

export function inicioJanelaFalhas(agora: Date): Date {
  return new Date(agora.getTime() - JANELA_FALHAS_MS);
}

export function loginBloqueado(falhasRecentes: number): boolean {
  return falhasRecentes >= MAX_FALHAS_LOGIN;
}

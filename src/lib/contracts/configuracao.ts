import { z } from "zod";

// Configuração de produto montada pelo comercial no configurador.
// ENVIADA = saiu do comercial; EM_ANALISE/ATENDIDA/RECUSADA são a resposta da
// equipe de Projetos (chegam pela ponte com o nextstep).
export const configuracaoStatusSchema = z.enum([
  "ENVIADA",
  "EM_ANALISE",
  "ATENDIDA",
  "RECUSADA",
]);
export type ConfiguracaoStatus = z.infer<typeof configuracaoStatusSchema>;

// Uma escolha crua do formulário. Os limites são propositalmente frouxos aqui —
// quem valida se a sigla existe de verdade é `resolverSelecoes` contra o
// catálogo, na Server Action.
export const escolhaConfiguracaoSchema = z.object({
  grupo: z.string().trim().min(1).max(24),
  opcao: z.string().trim().min(1).max(24),
  texto: z.string().trim().max(80).optional(),
});
export type EscolhaConfiguracaoInput = z.infer<typeof escolhaConfiguracaoSchema>;

export const criarConfiguracaoSchema = z.object({
  produtoSlug: z.string().trim().min(1).max(60),
  escolhas: z.array(escolhaConfiguracaoSchema).min(1).max(40),
  observacoes: z.string().trim().max(1000).optional(),
});
export type CriarConfiguracaoInput = z.infer<typeof criarConfiguracaoSchema>;

export const assumirConfiguracaoSchema = z.object({
  id: z.string().min(1),
});
export type AssumirConfiguracaoInput = z.infer<typeof assumirConfiguracaoSchema>;

// Resposta da equipe de Projetos. As obrigatoriedades (projeto no atender,
// motivo no recusar) são validadas na action, onde a mensagem é escrita para o
// usuário final.
export const responderConfiguracaoSchema = z.object({
  id: z.string().min(1),
  decisao: z.enum(["ATENDER", "RECUSAR"]),
  projetoCad: z.string().trim().max(60).optional(),
  nota: z.string().trim().max(1000).optional(),
});
export type ResponderConfiguracaoInput = z.infer<typeof responderConfiguracaoSchema>;

// Número sequencial exibido como "CFG-0001" (o inteiro vem do autoincrement).
export function formatarNumeroConfiguracao(numero: number): string {
  return `CFG-${String(numero).padStart(4, "0")}`;
}

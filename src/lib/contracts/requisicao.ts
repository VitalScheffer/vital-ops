import { z } from "zod";

export const requisicaoStatusSchema = z.enum(["PENDENTE", "CONFIRMADA", "RECUSADA"]);
export type RequisicaoStatus = z.infer<typeof requisicaoStatusSchema>;

export const requisicaoItemStatusSchema = z.enum(["PENDENTE", "BAIXADO", "FALHA"]);
export type RequisicaoItemStatus = z.infer<typeof requisicaoItemStatusSchema>;

// Item do carrinho na criação (frontend → Server Action). A descrição vem do
// Omie na validação do servidor, não do cliente.
export const criarRequisicaoItemSchema = z.object({
  sku: z.string().trim().min(1),
  quantidade: z.number().positive(),
});
export type CriarRequisicaoItemInput = z.infer<typeof criarRequisicaoItemSchema>;

// Payload de criação: um pedido com VÁRIOS itens (decisão de 16/07/2026).
// `solicitanteNome` é quem está pedindo de fato (pode diferir do usuário
// logado — ex. terminal compartilhado no chão de fábrica).
export const criarRequisicaoSchema = z.object({
  solicitanteNome: z.string().trim().min(1).max(120),
  setorId: z.string().min(1),
  observacao: z.string().trim().max(500).optional(),
  itens: z.array(criarRequisicaoItemSchema).min(1).max(50),
});
export type CriarRequisicaoInput = z.infer<typeof criarRequisicaoSchema>;

// Decisão do gestor sobre o pedido inteiro. O motivo é obrigatório na recusa
// (validado na action, onde a mensagem de erro é amigável). Na confirmação o
// gestor escolhe o local de estoque de onde a baixa sai ("0"/ausente = padrão).
export const decidirRequisicaoSchema = z.object({
  id: z.string().min(1),
  decisao: z.enum(["CONFIRMAR", "RECUSAR"]),
  motivo: z.string().trim().max(500).optional(),
  localCodigo: z
    .string()
    .trim()
    .regex(/^\d{1,15}$/)
    .optional(),
});
export type DecidirRequisicaoInput = z.infer<typeof decidirRequisicaoSchema>;

// Número sequencial exibido como "REQ-0001" (o inteiro vem do autoincrement).
export function formatarNumeroRequisicao(numero: number): string {
  return `REQ-${String(numero).padStart(4, "0")}`;
}

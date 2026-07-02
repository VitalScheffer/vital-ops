import { z } from "zod";

export const requisicaoStatusSchema = z.enum(["PENDENTE", "CONFIRMADA", "RECUSADA"]);
export type RequisicaoStatus = z.infer<typeof requisicaoStatusSchema>;

export const requisicaoSchema = z.object({
  id: z.string(),
  numero: z.string(),
  solicitanteId: z.string(),
  sku: z.string(),
  nome: z.string(),
  quantidade: z.number(),
  setorId: z.string(),
  status: requisicaoStatusSchema,
  gestorId: z.string().nullable().optional(),
  confirmadaEm: z.string().nullable().optional(), // ISO-8601
  criadoEm: z.string(), // ISO-8601
});
export type Requisicao = z.infer<typeof requisicaoSchema>;

// Payload de criação (frontend → API), Fase 3.
export const criarRequisicaoSchema = z.object({
  sku: z.string().min(1),
  nome: z.string().min(1),
  quantidade: z.number().positive(),
  setorId: z.string().min(1),
});
export type CriarRequisicaoInput = z.infer<typeof criarRequisicaoSchema>;

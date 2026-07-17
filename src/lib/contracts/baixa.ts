import { z } from "zod";

export const baixaItemStatusSchema = z.enum(["PENDENTE", "BAIXADO", "FALHA"]);
export type BaixaItemStatus = z.infer<typeof baixaItemStatusSchema>;

// Uma linha da planilha de baixa (matéria-prima MAT) já parseada no cliente.
// Pedido, nota fiscal, OP e observação são referências que viram a observação do
// movimento no Omie (vínculo nota ↔ pedido, finalidade do consumo); não são
// validadas contra o Omie. `observacao` é o campo livre de finalidade/motivo
// (ex.: "consumo na produção", "OP 1234") pedido pela fábrica.
export const baixaLinhaSchema = z.object({
  sku: z.string().trim().min(1),
  quantidade: z.number().positive(),
  pedido: z.string().trim().max(60).optional(),
  notaFiscal: z.string().trim().max(60).optional(),
  op: z.string().trim().max(60).optional(),
  solicitante: z.string().trim().max(120).optional(),
  observacao: z.string().trim().max(300).optional(),
});
export type BaixaLinha = z.infer<typeof baixaLinhaSchema>;

// Código do local de estoque no Omie ("0" = local padrão). Vem do
// ListarLocaisEstoque — só dígitos; fica String porque o id pode passar de 2^31.
export const localEstoqueCodigoSchema = z.string().trim().regex(/^\d{1,15}$/);

// Conferência (leitura, sem escrever no Omie): resolve códigos e saldos no
// local escolhido.
export const conferirBaixaSchema = z.object({
  itens: z.array(baixaLinhaSchema).min(1).max(200),
  localCodigo: localEstoqueCodigoSchema.optional(),
});
export type ConferirBaixaInput = z.infer<typeof conferirBaixaSchema>;

// Execução da baixa (escreve no Omie item a item, no local escolhido).
export const executarBaixaSchema = z.object({
  arquivoNome: z.string().trim().min(1).max(200),
  solicitante: z.string().trim().min(1).max(120),
  itens: z.array(baixaLinhaSchema).min(1).max(200),
  localCodigo: localEstoqueCodigoSchema.optional(),
});
export type ExecutarBaixaInput = z.infer<typeof executarBaixaSchema>;

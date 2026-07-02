import { z } from "zod";

// Status (espelham os enums do Prisma do módulo Produtos).
export const importStatusSchema = z.enum(["RASCUNHO", "ENVIANDO", "CONCLUIDO", "FALHA"]);
export type ImportStatus = z.infer<typeof importStatusSchema>;

export const produtoItemStatusSchema = z.enum(["NOVO", "DUPLICADO", "ERRO", "ENVIADO", "FALHA"]);
export type ProdutoItemStatus = z.infer<typeof produtoItemStatusSchema>;

export const estruturaStatusSchema = z.enum(["PENDENTE", "ENVIADO", "FALHA"]);
export type EstruturaStatus = z.infer<typeof estruturaStatusSchema>;

export const produtoItemSchema = z.object({
  id: z.string(),
  importId: z.string(),
  codigo: z.string(),
  descricao: z.string(),
  familia: z.string().nullable().optional(),
  ncm: z.string(),
  unidade: z.string(),
  tipo: z.string(),
  localEstoque: z.string().nullable().optional(),
  controleLote: z.boolean(),
  status: produtoItemStatusSchema,
  motivoErro: z.string().nullable().optional(),
  omieCodigoProduto: z.string().nullable().optional(),
});
export type ProdutoItem = z.infer<typeof produtoItemSchema>;

export const estruturaItemSchema = z.object({
  id: z.string(),
  importId: z.string(),
  numeroPai: z.string(),
  numeroFilho: z.string(),
  codigoPai: z.string(),
  codigoFilho: z.string(),
  quantidade: z.number(),
  status: estruturaStatusSchema,
  motivoErro: z.string().nullable().optional(),
});
export type EstruturaItem = z.infer<typeof estruturaItemSchema>;

export const produtoImportSchema = z.object({
  id: z.string(),
  autorId: z.string(),
  arquivoNome: z.string(),
  status: importStatusSchema,
  totalProdutos: z.number(),
  totalEstrutura: z.number(),
  criadoEm: z.string(), // ISO-8601
});
export type ProdutoImport = z.infer<typeof produtoImportSchema>;

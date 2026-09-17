import { z } from "zod";

// Recebimento de NF: checklist manual (o usuário digita e marca, sem nenhuma
// leitura automática do Omie/fornecedor). Um produto por linha, 4 checks cada.

export const RECEBIMENTO_EVENTOS = ["materialRecebido", "temOC", "ocAprovado", "nfeLancada"] as const;
export type RecebimentoEvento = (typeof RECEBIMENTO_EVENTOS)[number];

export const criarNotaRecebimentoSchema = z.object({
  numero: z.string().trim().min(1).max(60),
});
export type CriarNotaRecebimentoInput = z.infer<typeof criarNotaRecebimentoSchema>;

export const editarNotaRecebimentoSchema = z.object({
  id: z.string().min(1),
  numero: z.string().trim().min(1).max(60),
});
export type EditarNotaRecebimentoInput = z.infer<typeof editarNotaRecebimentoSchema>;

export const removerNotaRecebimentoSchema = z.object({ id: z.string().min(1) });
export type RemoverNotaRecebimentoInput = z.infer<typeof removerNotaRecebimentoSchema>;

// Consulta limitada ao período de um card semanal para exportação. As datas
// são civis no fuso de São Paulo (AAAA-MM-DD), nunca timestamps do navegador.
export const listarNotasRecebimentoParaExportacaoSchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ListarNotasRecebimentoParaExportacaoInput = z.infer<typeof listarNotasRecebimentoParaExportacaoSchema>;

export const adicionarItemRecebimentoSchema = z.object({
  notaId: z.string().min(1),
  produto: z.string().trim().min(1).max(200),
});
export type AdicionarItemRecebimentoInput = z.infer<typeof adicionarItemRecebimentoSchema>;

export const removerItemRecebimentoSchema = z.object({ id: z.string().min(1) });
export type RemoverItemRecebimentoInput = z.infer<typeof removerItemRecebimentoSchema>;

// Marca/desmarca UM evento de UM item.
export const marcarCheckRecebimentoSchema = z.object({
  itemId: z.string().min(1),
  evento: z.enum(RECEBIMENTO_EVENTOS),
  marcado: z.boolean(),
});
export type MarcarCheckRecebimentoInput = z.infer<typeof marcarCheckRecebimentoSchema>;

// Marca/desmarca um evento em TODOS os itens de uma nota (botão "marcar todos"
// no cabeçalho da coluna, dentro de cada NF).
export const marcarColunaRecebimentoSchema = z.object({
  notaId: z.string().min(1),
  evento: z.enum(RECEBIMENTO_EVENTOS),
  marcado: z.boolean(),
});
export type MarcarColunaRecebimentoInput = z.infer<typeof marcarColunaRecebimentoSchema>;

// DTOs serializáveis (dataEmissao como string ISO) — o que trafega entre o
// Server Component da página e o client component da tabela.
export interface ItemRecebimentoDTO {
  id: string;
  produto: string;
  materialRecebido: boolean;
  temOC: boolean;
  ocAprovado: boolean;
  nfeLancada: boolean;
}

export interface NotaRecebimentoDTO {
  id: string;
  numero: string;
  fornecedor: string;
  dataEmissao: string;
  criadoEm: string;
  itens: ItemRecebimentoDTO[];
}

import { z } from "zod";

import { localEstoqueCodigoSchema } from "./baixa";

// Movimentação por OP: transferência de material entre locais de estoque a
// partir do número da Ordem de Produção do Omie.

export const grupoItemSchema = z.enum(["MAT", "COM", "SBM", "PECA", "OUTRO"]);
export type GrupoItemMovimento = z.infer<typeof grupoItemSchema>;

// Número da OP como a pessoa digita. Aceita "2026/00802", "2026-802" ou "802";
// a normalização e o casamento com o `cNumOP` do Omie são do módulo de OP.
export const numeroOpSchema = z.string().trim().min(1).max(30);

// Uma linha escolhida na tela. `idProd` é o id INTERNO do Omie, que é como a OP
// identifica o item; o `sku` vai junto porque é ele que aparece no histórico e
// em toda mensagem de erro (id interno não diz nada para quem lê depois).
export const movimentoItemSchema = z.object({
  idProd: z.string().trim().regex(/^\d{1,20}$/),
  sku: z.string().trim().min(1).max(60),
  descricao: z.string().trim().max(200).optional(),
  unidade: z.string().trim().max(10).optional(),
  familia: z.string().trim().max(120).optional(),
  grupo: grupoItemSchema.optional(),
  quantidade: z.number().positive().finite(),
  /**
   * Código NOVO que a OP pediu, quando esta linha está movendo o cadastro
   * ANTIGO no lugar dele. Sem isso o histórico diria que a OP consumiu um PRD
   * que ela nunca pediu.
   */
  substituiSku: z.string().trim().max(60).optional(),
});
export type MovimentoItemInput = z.infer<typeof movimentoItemSchema>;

// Conferência (leitura, sem escrever no Omie): resolve a OP, os produtos e o
// saldo na origem.
export const conferirOpSchema = z.object({
  numeroOp: numeroOpSchema,
  origemCodigo: localEstoqueCodigoSchema,
  recarregar: z.boolean().optional(),
});
export type ConferirOpInput = z.infer<typeof conferirOpSchema>;

// Origem e destino IGUAIS não é transferência, é um par de ajustes que se
// anulam gastando duas escritas no Omie. Recusado no contrato, antes de chegar
// perto do ERP.
export const executarMovimentoSchema = z
  .object({
    numeroOp: numeroOpSchema,
    origemCodigo: localEstoqueCodigoSchema,
    destinoCodigo: localEstoqueCodigoSchema,
    itens: z.array(movimentoItemSchema).min(1).max(300),
  })
  .refine((v) => v.origemCodigo !== v.destinoCodigo, {
    message: "A origem e o destino precisam ser locais diferentes.",
    path: ["destinoCodigo"],
  });
export type ExecutarMovimentoInput = z.infer<typeof executarMovimentoSchema>;

// Retomada de um movimento que ficou com item em SAIDA_OK (saiu da origem e não
// entrou no destino). Só o id: os itens e os locais vêm do banco, não da tela —
// retomar com locais diferentes dos originais devolveria o material no lugar
// errado.
export const continuarMovimentoSchema = z.object({
  movimentoId: z.string().trim().min(1).max(40),
});
export type ContinuarMovimentoInput = z.infer<typeof continuarMovimentoSchema>;

// --- De/Para de código antigo -----------------------------------------------

export const confiancaDeParaSchema = z.enum(["EXATA", "APROXIMADA", "MANUAL", "SEM_EQUIVALENTE"]);
export type ConfiancaDeParaGravada = z.infer<typeof confiancaDeParaSchema>;

// `codigoNovo` nulo só é aceito com SEM_EQUIVALENTE: é a diferença entre "olhei
// e não existe equivalente" (decisão registrada) e uma linha salva pela metade.
export const salvarDeParaSchema = z
  .object({
    codigoLegado: z.string().trim().min(1).max(60),
    descricaoLegado: z.string().trim().min(1).max(200),
    unidadeLegado: z.string().trim().max(10).optional(),
    codigoNovo: z.string().trim().max(60).nullable().optional(),
    descricaoNovo: z.string().trim().max(200).optional(),
    unidadeNovo: z.string().trim().max(10).optional(),
    confianca: confiancaDeParaSchema,
    motivo: z.string().trim().max(300).optional(),
    observacao: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.confianca === "SEM_EQUIVALENTE" || Boolean(v.codigoNovo), {
    message: "Escolha o código novo ou marque \"sem equivalente\".",
    path: ["codigoNovo"],
  });
export type SalvarDeParaInput = z.infer<typeof salvarDeParaSchema>;

export const removerDeParaSchema = z.object({
  codigoLegado: z.string().trim().min(1).max(60),
});
export type RemoverDeParaInput = z.infer<typeof removerDeParaSchema>;

// --- Consumo do que foi reservado (baixa da OP) e estorno --------------------

// Uma linha da baixa. `localCodigo` por item porque a pessoa pode ter guardado
// parte do material em outro lugar; quando ela não escolhe, cai no local da
// reserva daquele item, não num padrão global escondido.
export const baixaOpItemSchema = z.object({
  itemId: z.string().trim().min(1).max(40),
  localCodigo: localEstoqueCodigoSchema.optional(),
});
export type BaixaOpItemInput = z.infer<typeof baixaOpItemSchema>;

export const baixarOpSchema = z.object({
  numeroOp: numeroOpSchema,
  itens: z.array(baixaOpItemSchema).min(1).max(300),
});
export type BaixarOpInput = z.infer<typeof baixarOpSchema>;

// Estorno: devolve o material ao local de onde a baixa saiu. Recebe só os ids;
// local, quantidade e lotes vêm do banco, do registro da própria baixa.
export const estornarOpSchema = z.object({
  itemIds: z.array(z.string().trim().min(1).max(40)).min(1).max(300),
});
export type EstornarOpInput = z.infer<typeof estornarOpSchema>;

// --- Multiplicador: puxar os itens de uma OP --------------------------------

export const puxarOpSchema = z.object({
  numeroOp: numeroOpSchema,
});
export type PuxarOpInput = z.infer<typeof puxarOpSchema>;

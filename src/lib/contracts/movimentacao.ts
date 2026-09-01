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

// Fator de conversão do par, na direção "1 unidade do NOVO = X do ANTIGO".
// O teto não é enfeite: fator acima de 100 mil quase sempre é vírgula digitada
// como ponto (ou o contrário), e um fator errado aqui vira quantidade errada em
// TODA movimentação futura daquele par.
export const fatorConversaoSchema = z.number().positive().finite().max(100_000);

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
    fatorConversao: fatorConversaoSchema.nullable().optional(),
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

// Busca de cadastro no Omie por código ou por parte da descrição. Existe porque
// a fila do De/Para sai da POSIÇÃO DE ESTOQUE, e cadastro com saldo zero em
// todos os locais (o caso do PRD02227) simplesmente não aparece lá. Sem uma
// busca direta no catálogo, esse código não tem como ser ligado nunca.
export const buscarCadastroSchema = z.object({
  termo: z.string().trim().min(2).max(80),
  /** Local usado para mostrar o saldo na linha encontrada. */
  localCodigo: localEstoqueCodigoSchema.optional(),
});
export type BuscarCadastroInput = z.infer<typeof buscarCadastroSchema>;

// Conferência de pendências antes de aposentar um código antigo. Só leitura.
export const pendenciasLegadoSchema = z.object({
  codigoLegado: z.string().trim().min(1).max(60),
});
export type PendenciasLegadoInput = z.infer<typeof pendenciasLegadoSchema>;

// Migração de saldo + aposentadoria do código antigo.
//
// `inativarNoOmie` é separado e explícito porque é ESCRITA no cadastro do ERP,
// e escrita que a tela não pode desfazer sozinha. Aposentar aqui dentro é
// reversível; inativar lá não é, pela tela.
export const migrarLegadoSchema = z.object({
  codigoLegado: z.string().trim().min(1).max(60),
  inativarNoOmie: z.boolean().default(false),
  /**
   * A pessoa leu as pendências (OP aberta, requisição, pedido de compra) e
   * decidiu seguir mesmo assim. Sem isso, migrar com documento em aberto é
   * recusado no servidor, não só escondido na tela.
   */
  confirmaPendencias: z.boolean().default(false),
});
export type MigrarLegadoInput = z.infer<typeof migrarLegadoSchema>;

// Desfaz a tag de aposentado: o código volta a aparecer na fila e a ser
// oferecido como substituto. NÃO desfaz o saldo migrado nem a inativação no
// Omie — estoque não volta por causa de um clique numa tag.
export const reativarLegadoSchema = z.object({
  codigoLegado: z.string().trim().min(1).max(60),
});
export type ReativarLegadoInput = z.infer<typeof reativarLegadoSchema>;

// Retomada de uma migração que ficou com local em SAIDA_OK.
export const continuarMigracaoSchema = z.object({
  migracaoId: z.string().trim().min(1).max(40),
});
export type ContinuarMigracaoInput = z.infer<typeof continuarMigracaoSchema>;

// Busca livre de substituto na Movimentação por OP: em vez de escolher só entre
// os candidatos que o sistema deduziu, a pessoa procura o cadastro pelo código
// ou pela descrição e vê o saldo dele NA ORIGEM.
export const buscarSubstitutoSchema = z.object({
  termo: z.string().trim().min(2).max(80),
  origemCodigo: localEstoqueCodigoSchema,
  /** Código que a OP pede — usado para avaliar a mudança de unidade. */
  skuDaOp: z.string().trim().min(1).max(60),
  /** Quanto a OP pede (na unidade do código novo), para já converter pelo fator. */
  quantidadePedida: z.number().positive().finite().optional(),
});
export type BuscarSubstitutoInput = z.infer<typeof buscarSubstitutoSchema>;

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

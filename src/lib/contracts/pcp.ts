import { z } from "zod";

import { configuracaoStatusSchema } from "./configuracao";

// Contrato da PONTE DE LEITURA do PCP.
//
// O PCP (Django, na AWS, banco próprio) PUXA daqui as configurações do
// configurador para abrir Ordem de Produção. A ponte é HTTP e só tem uma
// direção: `GET /api/pcp/configuracoes`. Nada escreve neste banco por ela.
//
// O payload é deliberadamente ENXUTO: leva o que identifica a configuração e o
// que descreve o produto, e NÃO leva nenhum identificador de pessoa
// (`autorId`, `autorEmail`, `respondidoPorId`). O PCP não precisa disso para
// gerar uma OP, e dado pessoal que não atravessa a ponte não vaza do outro lado.

// "TODAS" só existe na CONSULTA (não é status do model): é o coringa para o PCP
// pedir a fila inteira em vez de um estado só. NÃO combina com `desde` — ver
// `pcpConfiguracoesQuerySchema`.
export const PCP_STATUS_TODAS = "TODAS";

// O PCP gera OP do que a equipe de Projetos ATENDEU — esse é o caso de uso, e
// por isso é o default de quem não passa `status`.
export const PCP_STATUS_PADRAO = "ATENDIDA";

export const PCP_LIMITE_PADRAO = 100;
export const PCP_LIMITE_MAX = 200;

export const pcpStatusFiltroSchema = z.union(
  [configuracaoStatusSchema, z.literal(PCP_STATUS_TODAS)],
  { error: "use ENVIADA, EM_ANALISE, ATENDIDA, RECUSADA ou TODAS" },
);
export type PcpStatusFiltro = z.infer<typeof pcpStatusFiltroSchema>;

// `desde` aceita qualquer data ISO ("2026-08-01" ou "2026-08-01T13:00:00Z") e
// já sai como Date, para o handler não repetir parse nenhum.
const desdeSchema = z
  .string()
  .trim()
  .refine((valor) => valor.length > 0 && !Number.isNaN(Date.parse(valor)), {
    error: "informe uma data ISO (ex.: 2026-08-01T00:00:00Z)",
  })
  .transform((valor) => new Date(valor));

// `limite` acima do teto é APARADO para o teto em vez de virar erro: o teto é
// proteção nossa (nunca devolver a tabela inteira), não regra que o cliente
// precise adivinhar. Já valor não-numérico ou < 1 é erro de quem chamou.
const limiteSchema = z.coerce
  .number({ error: `informe um inteiro entre 1 e ${PCP_LIMITE_MAX}` })
  .int({ error: `informe um inteiro entre 1 e ${PCP_LIMITE_MAX}` })
  .min(1, { error: `informe um inteiro entre 1 e ${PCP_LIMITE_MAX}` })
  .transform((valor) => Math.min(valor, PCP_LIMITE_MAX));

// COMBINAÇÃO PROIBIDA: `status=TODAS` junto com `desde` responde 400.
//
// O filtro do `desde` é "última movimentação" = coalesce(respondidoEm,
// criadoEm), mas a ordenação que a paginação usa começa em `respondidoEm`, e no
// Postgres NULL vai para o FIM do ASC. Enquanto a consulta é de um status só os
// dois casam (nos terminais `respondidoEm` está sempre preenchido; nos abertos
// é null em todos e quem ordena é `criadoEm`). Em TODAS os dois grupos se
// misturam: os ainda não respondidos ficam no fim, são cortados pelo `limite` e
// somem de vez quando o cliente avança o `desde` — perda SILENCIOSA de
// registro. Recusar a combinação é o que impede o cliente do outro lado de
// descobrir isso sozinho, seis meses depois, contando OP que não foi aberta.
export const pcpConfiguracoesQuerySchema = z
  .object({
    status: pcpStatusFiltroSchema.default(PCP_STATUS_PADRAO),
    desde: desdeSchema.optional(),
    limite: limiteSchema.default(PCP_LIMITE_PADRAO),
  })
  .refine((consulta) => !(consulta.status === PCP_STATUS_TODAS && consulta.desde), {
    error:
      "status=TODAS nao aceita desde: sincronize por status (uma chamada por status, ex.: status=ATENDIDA&desde=...). Sem status fixo a paginacao por desde perde os registros ainda nao respondidos.",
  });
export type PcpConfiguracoesQuery = z.infer<typeof pcpConfiguracoesQuerySchema>;

// Uma escolha do snapshot `selecoes`. Guarda os RÓTULOS, não só as siglas: o
// PCP consegue imprimir "Material: Inox" na OP sem conhecer o catálogo daqui.
export const pcpSelecaoSchema = z.object({
  grupoCodigo: z.string(),
  grupoRotulo: z.string(),
  opcaoCodigo: z.string(),
  opcaoRotulo: z.string(),
  texto: z.string().nullable(),
  padrao: z.boolean(),
});
export type PcpSelecao = z.infer<typeof pcpSelecaoSchema>;

// Datas viajam como string ISO 8601 em UTC (JSON não tem tipo data).
export const pcpConfiguracaoSchema = z.object({
  numero: z.number().int(),
  numeroFormatado: z.string(),
  codigo: z.string(),
  produtoSlug: z.string(),
  produtoNome: z.string(),
  autorNome: z.string(),
  foraDoPadrao: z.number().int(),
  observacoes: z.string().nullable(),
  selecoes: z.array(pcpSelecaoSchema),
  status: configuracaoStatusSchema,
  projetoCad: z.string().nullable(),
  respostaNota: z.string().nullable(),
  respondidoEm: z.string().nullable(),
  criadoEm: z.string(),
});
export type PcpConfiguracao = z.infer<typeof pcpConfiguracaoSchema>;

// `total` é quantas vieram NESTA resposta (não o tamanho da fila inteira).
// Serve de sinal de truncamento para o cliente: `total === limite` significa
// "provavelmente tem mais, chame de novo com o `proximoDesde`".
//
// PROTOCOLO DE SINCRONIZAÇÃO (obrigatório para não perder registro):
//   1. chame com `status=<um status>` e o `desde` da última rodada;
//   2. guarde o `proximoDesde` DESTA resposta e use como `desde` da próxima;
//   3. DEDUPLIQUE por `numero`, que é único e imutável — o `proximoDesde` volta
//      alguns minutos no tempo de propósito, então registros repetem.
//
// Por que não deduzir a marca d'água no cliente: as duas deduções óbvias perdem
// registro. "último recebido + 1ms" perde os empates no mesmo milissegundo
// cortados pelo `limite` (é exatamente o que sai de um backfill que carimba
// `respondidoEm` em lote, onde um UPDATE só carimba todo mundo com o mesmo
// instante). E existe a corrida de ordem de commit: a resposta A carimba T1 e
// commita devagar, B carimba T2 > T1 e commita antes; um sync que passe no meio
// enxerga só B e avança para T2 — A nunca mais entra em nenhuma janela. Daí a
// FOLGA embutida no `proximoDesde` (ver PCP_FOLGA_PROXIMO_DESDE_MS em
// `@/lib/pcp/configuracoes`): reprocessar alguns minutos é barato, o dedupe por
// `numero` absorve, e a alternativa é OP que nunca é aberta.
//
// LIMITE CONHECIDO: se MAIS de `limite` registros couberem dentro da janela da
// folga (backfill grande de uma vez), o `proximoDesde` volta para dentro da
// mesma página e o sync para de avançar. É visível (a mesma página repetindo) e
// se resolve subindo o `limite` até o teto ou carimbando o backfill em lotes
// menores. Resolver de vez pede cursor composto (data + numero), que é mudança
// de contrato — quando a fila crescer a ponto disso importar.
export const pcpConfiguracoesResponseSchema = z.object({
  configuracoes: z.array(pcpConfiguracaoSchema),
  total: z.number().int().nonnegative(),
  // Data ISO para o `desde` da PRÓXIMA chamada, já com a folga descontada.
  proximoDesde: z.string(),
});
export type PcpConfiguracoesResponse = z.infer<typeof pcpConfiguracoesResponseSchema>;

// Envelope de erro da ponte. Separado do `ApiError` das rotas de tela (que usa
// a chave `error`) de propósito: aqui o consumidor é outro sistema, e o
// contrato dele fica todo em pt-BR sem acento, estável e fácil de casar.
// `detalhe` só aparece em erro de PARÂMETRO — recusa de credencial nunca
// explica o motivo.
export const pcpErroSchema = z.object({
  erro: z.string(),
  detalhe: z.string().optional(),
});
export type PcpErro = z.infer<typeof pcpErroSchema>;

// Mensagem de 400 legível para quem está escrevendo o cliente do outro lado.
// Só fala de parâmetro de consulta — nada aqui é informação sensível.
export function mensagemDeParametrosInvalidos(erro: z.ZodError): string {
  return erro.issues
    .map((issue) => `${issue.path.join(".") || "consulta"}: ${issue.message}`)
    .join("; ");
}

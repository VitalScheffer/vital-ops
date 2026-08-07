import type { Prisma } from "@prisma/client";

import type {
  ConfiguracaoStatus,
  PcpConfiguracao,
  PcpConfiguracoesQuery,
  PcpSelecao,
} from "@/lib/contracts";
import { formatarNumeroConfiguracao, PCP_STATUS_TODAS } from "@/lib/contracts";

// Consulta e payload da ponte do PCP, puros e testáveis. O Route Handler só
// junta as peças daqui — assim a garantia de "não vaza dado pessoal" é um teste,
// não uma leitura atenta do handler.

// SELECT explícito, nunca `include`/objeto inteiro. Os campos de pessoa do model
// (`autorId`, `autorEmail`, `respondidoPorId`) não estão aqui de propósito: o PCP
// gera OP a partir do produto e das escolhas, e `autorNome` já responde "quem
// pediu". O que não é lido do banco não tem como escapar no JSON.
export const SELECAO_CONFIGURACAO = {
  numero: true,
  codigo: true,
  produtoSlug: true,
  produtoNome: true,
  autorNome: true,
  foraDoPadrao: true,
  observacoes: true,
  selecoes: true,
  status: true,
  projetoCad: true,
  respostaNota: true,
  respondidoEm: true,
  criadoEm: true,
} satisfies Prisma.ConfiguracaoSelect;

export type RegistroConfiguracao = Prisma.ConfiguracaoGetPayload<{
  select: typeof SELECAO_CONFIGURACAO;
}>;

// ORDEM e FILTRO andam juntos, e a escolha aqui é o coração do sync incremental.
//
// O campo de data do `desde` é `respondidoEm`, COM FALLBACK em `criadoEm` quando
// a configuração ainda não foi respondida (`respondidoEm` é null até a equipe de
// Projetos fechar o caso). Ou seja: o filtro é "última movimentação" =
// coalesce(respondidoEm, criadoEm) >= desde. Sem o fallback, uma configuração
// ENVIADA/EM_ANALISE nunca apareceria numa consulta com `desde`; só com
// `criadoEm`, uma configuração antiga respondida hoje nunca apareceria — e é
// justamente ela que o PCP precisa ver para abrir a OP.
//
// A ORDEM usa a mesma chave, e isso não é enfeite: com o teto do `limite`, o
// cliente só consegue avançar com segurança se a ordenação for a mesma coisa que
// o filtro. Nos status TERMINAIS (ATENDIDA/RECUSADA — o caso de uso do PCP)
// `respondidoEm` está sempre preenchido, então ordenar por ele é exatamente
// ordenar pela chave filtrada, e a marca d'água da próxima chamada é o
// `respondidoEm` do último item recebido. Nos status abertos, `respondidoEm` é
// null em todos e quem manda é o desempate por `criadoEm` — também consistente.
// Só em `status=TODAS` os dois grupos se misturam (o Postgres joga NULL para o
// fim no ASC): aí o cliente deve sincronizar por status, não tudo junto.
export const ORDEM_CONFIGURACOES: Prisma.ConfiguracaoOrderByWithRelationInput[] = [
  { respondidoEm: "asc" },
  { criadoEm: "asc" },
  { numero: "asc" },
];

export function filtroDeConfiguracoes(
  query: PcpConfiguracoesQuery,
): Prisma.ConfiguracaoWhereInput {
  const filtro: Prisma.ConfiguracaoWhereInput = {};

  if (query.status !== PCP_STATUS_TODAS) {
    filtro.status = query.status;
  }

  if (query.desde) {
    filtro.OR = [
      { respondidoEm: { gte: query.desde } },
      { respondidoEm: null, criadoEm: { gte: query.desde } },
    ];
  }

  return filtro;
}

export function paraPayloadPcp(registro: RegistroConfiguracao): PcpConfiguracao {
  return {
    numero: registro.numero,
    numeroFormatado: formatarNumeroConfiguracao(registro.numero),
    codigo: registro.codigo,
    produtoSlug: registro.produtoSlug,
    produtoNome: registro.produtoNome,
    autorNome: registro.autorNome,
    foraDoPadrao: registro.foraDoPadrao,
    observacoes: registro.observacoes,
    selecoes: normalizarSelecoes(registro.selecoes),
    // O status é String no banco (o enum vive no contrato). A consulta só traz
    // os valores do enum, então a conversão é segura.
    status: registro.status as ConfiguracaoStatus,
    projetoCad: registro.projetoCad,
    respostaNota: registro.respostaNota,
    respondidoEm: registro.respondidoEm?.toISOString() ?? null,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

// `selecoes` é Json (snapshot gravado no envio) e pode ter vindo de um catálogo
// mais antigo. Normaliza tolerante, igual ao `escolhasDeSelecoes` do
// configurador: item sem grupo/opção é descartado, rótulo faltando cai na sigla.
// Assim a resposta SEMPRE bate com `pcpSelecaoSchema` e o cliente do PCP pode
// validar o payload sem tratar exceção de dado velho.
export function normalizarSelecoes(snapshot: unknown): PcpSelecao[] {
  if (!Array.isArray(snapshot)) {
    return [];
  }

  const selecoes: PcpSelecao[] = [];
  for (const bruto of snapshot) {
    if (!bruto || typeof bruto !== "object") {
      continue;
    }
    const item = bruto as Record<string, unknown>;
    const grupoCodigo = textoOuVazio(item.grupoCodigo);
    const opcaoCodigo = textoOuVazio(item.opcaoCodigo);
    if (!grupoCodigo || !opcaoCodigo) {
      continue;
    }

    selecoes.push({
      grupoCodigo,
      grupoRotulo: textoOuVazio(item.grupoRotulo) || grupoCodigo,
      opcaoCodigo,
      opcaoRotulo: textoOuVazio(item.opcaoRotulo) || opcaoCodigo,
      texto: textoOuVazio(item.texto) || null,
      padrao: item.padrao === true,
    });
  }
  return selecoes;
}

function textoOuVazio(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

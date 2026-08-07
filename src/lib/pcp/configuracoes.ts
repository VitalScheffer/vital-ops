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
// `proximoDesde` da resposta. Nos status abertos, `respondidoEm` é null em todos
// e quem manda é o desempate por `criadoEm` — também consistente.
//
// Em `status=TODAS` os dois grupos se misturam (o Postgres joga NULL para o fim
// no ASC) e a ordenação deixa de ser monotônica na chave filtrada: os ainda não
// respondidos caem no fim, o `limite` corta, e quando o cliente avança o `desde`
// eles saem do filtro para sempre. Isso não é mais um aviso para quem lê o
// código — a REGRA está no contrato: `status=TODAS` junto com `desde` responde
// 400 (ver `pcpConfiguracoesQuerySchema`). TODAS sem `desde` continua valendo,
// que é o coringa para pedir a fila inteira.
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

// FOLGA da marca d'água devolvida em `proximoDesde`.
//
// Por que 5 minutos: o buraco que ela tapa é a diferença entre CARIMBAR o
// `respondidoEm` e o commit ficar visível para a próxima consulta — transação
// que demora, requisição lenta, e a soma disso com a diferença de relógio entre
// instâncias. Segundos explicam o caso normal; 5 minutos cobre o caso ruim sem
// depender de o relógio estar certinho. O custo é reprocessar o que se moveu nos
// últimos 5 minutos (nesta fila, unidades de registro), e o cliente deduplica
// por `numero`. Menos que isso economiza nada e volta a apostar em relógio;
// muito mais que isso aumenta a chance de o `limite` não caber na janela da
// folga, que é o único jeito de o sync empacar (ver o contrato).
export const PCP_FOLGA_PROXIMO_DESDE_MS = 5 * 60_000;

// Marca d'água da PRÓXIMA chamada, calculada aqui (e não adivinhada no cliente).
// Regras, nesta ordem:
//   - página vazia: devolve o próprio `desde` que veio, sem descontar folga de
//     novo — senão cada consulta sem novidade andaria 5 minutos para trás, para
//     sempre. Sem `desde` na consulta, ancora em agora - folga.
//   - página com itens: maior "última movimentação" da página menos a folga,
//     nunca ANTES do `desde` pedido (voltar mais que isso não descobre nada: o
//     que estava abaixo do `desde` já não entrava na consulta anterior).
export function proximoDesdeDaPagina(
  configuracoes: PcpConfiguracao[],
  desde?: Date,
  agora: Date = new Date(),
): string {
  const desdeMs = desde?.getTime();

  if (configuracoes.length === 0) {
    return new Date(desdeMs ?? agora.getTime() - PCP_FOLGA_PROXIMO_DESDE_MS).toISOString();
  }

  const maior = Math.max(...configuracoes.map(movimentacaoEmMs));
  const comFolga = maior - PCP_FOLGA_PROXIMO_DESDE_MS;
  return new Date(desdeMs === undefined ? comFolga : Math.max(desdeMs, comFolga)).toISOString();
}

// "Última movimentação" do registro: a mesma coalesce(respondidoEm, criadoEm)
// que o filtro do `desde` usa. Tem que ser a mesma, senão a marca d'água aponta
// para uma coisa e o filtro corta por outra.
function movimentacaoEmMs(configuracao: PcpConfiguracao): number {
  return Date.parse(configuracao.respondidoEm ?? configuracao.criadoEm);
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

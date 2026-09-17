import { chamar, type OmiePayload } from "@/lib/omie";

const NOTAS_POR_ORIGEM = 25;
const CACHE_SECONDS = 5 * 60;

export interface NotaOmieDTO {
  id: string;
  numero: string;
  parceiro: string;
  dataEmissao: string | null;
  valor: number | null;
  produtos: ProdutoOmieDTO[];
}

export interface ProdutoOmieDTO {
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
}

export type NotasOmieDTO =
  | {
      status: "ok";
      totalEntradas: number;
      notas: NotaOmieDTO[];
      atualizadoEm: string;
    }
  | { status: "error"; message: string };

function comoObjeto(valor: unknown): OmiePayload | null {
  return typeof valor === "object" && valor !== null ? (valor as OmiePayload) : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function inteiro(valor: unknown): number | null {
  const valorNumerico = numero(valor);
  return valorNumerico === null ? null : Math.trunc(valorNumerico);
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

function produtosEntrada(recebimento: unknown): ProdutoOmieDTO[] {
  return lista(comoObjeto(recebimento)?.itensRecebimento).flatMap((item) => {
    const cabecalho = comoObjeto(comoObjeto(item)?.itensCabec);
    const ajustes = comoObjeto(comoObjeto(item)?.itensAjustes);
    const descricao = texto(cabecalho?.cDescricaoProduto);
    if (!descricao) return [];

    return [{
      descricao,
      quantidade: numero(cabecalho?.nQtdeNFe) ?? numero(ajustes?.nQtdeRecebida),
      unidade: texto(cabecalho?.cUnidadeNfe) ?? texto(ajustes?.cUnidade),
    }];
  });
}

function dataParaOrdem(data: string | null): number {
  if (!data || !/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return 0;
  const [dia, mes, ano] = data.split("/").map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

function entradasDaResposta(resposta: OmiePayload | null): NotaOmieDTO[] {
  if (!resposta || !Array.isArray(resposta.recebimentos)) return [];

  return resposta.recebimentos.flatMap((recebimento) => {
    const cabecalho = comoObjeto(comoObjeto(recebimento)?.cabec);
    const id = inteiro(cabecalho?.nIdReceb);
    const numeroNf = texto(cabecalho?.cNumeroNFe);
    if (id === null || !numeroNf) return [];

    return [{
      id: `entrada:${id}`,
      numero: numeroNf,
      parceiro: texto(cabecalho?.cRazaoSocial) ?? texto(cabecalho?.cNome) ?? "Fornecedor não informado",
      dataEmissao: texto(cabecalho?.dEmissaoNFe),
      valor: numero(cabecalho?.nValorNFe),
      produtos: produtosEntrada(recebimento),
    }];
  });
}

// Espelha as duas origens fiscais do Omie. A leitura é isolada do checklist
// manual: não persiste, não exporta e não altera dados do Omie.
export async function listarNotasOmie(): Promise<NotasOmieDTO> {
  try {
    const primeiraPaginaEntradas = await chamar(
      "produtos/recebimentonfe",
      "ListarRecebimentos",
      { nPagina: 1, nRegistrosPorPagina: NOTAS_POR_ORIGEM, cEtapa: "40" },
      { ttlSeconds: CACHE_SECONDS },
    );

    const totalEntradas = inteiro(primeiraPaginaEntradas?.nTotalRegistros) ?? 0;
    const paginaFinalEntradas = Math.max(inteiro(primeiraPaginaEntradas?.nTotalPaginas) ?? 1, 1);
    const respostaEntradas = await chamar(
      "produtos/recebimentonfe",
      "ListarRecebimentos",
      { nPagina: paginaFinalEntradas, nRegistrosPorPagina: NOTAS_POR_ORIGEM, cEtapa: "40", cExibirDetalhes: "S" },
      { ttlSeconds: CACHE_SECONDS },
    );

    return {
      status: "ok",
      totalEntradas,
      notas: entradasDaResposta(respostaEntradas).sort(
        (a, b) => dataParaOrdem(b.dataEmissao) - dataParaOrdem(a.dataEmissao),
      ),
      atualizadoEm: new Date().toISOString(),
    };
  } catch (erro) {
    console.warn("[recebimento] Não foi possível consultar notas no Omie.", erro);
    return { status: "error", message: "Não foi possível consultar as notas no Omie agora." };
  }
}

export async function localizarNotaEntradaOmie(numero: string): Promise<NotaOmieDTO | null> {
  const resposta = await listarNotasOmie();
  if (resposta.status === "error") return null;

  return resposta.notas.find((nota) => nota.numero === numero) ?? null;
}

// A última página da consulta do Omie contém as entradas mais antigas. Ela
// define o começo real do calendário de emissão, sem inventar meses sem NF.
export async function obterDataMaisAntigaNotaEntradaOmie(): Promise<string | null> {
  const resposta = await listarNotasOmie();
  if (resposta.status === "error") return null;

  return resposta.notas
    .map((nota) => nota.dataEmissao)
    .filter((data): data is string => data !== null)
    .sort((a, b) => dataParaOrdem(a) - dataParaOrdem(b))[0] ?? null;
}

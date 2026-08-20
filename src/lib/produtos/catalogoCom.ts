// Catálogo de itens COMPRADOS ("COM...") lido do Omie.
//
// Serve à lista de compra do compilador de pranchas, que precisa de duas coisas
// que a BOM não traz: a UNIDADE em que o item é comprado e a confirmação de que
// o código existe no cadastro. Item que está na BOM e não está no Omie é o erro
// caro aqui — a lista sai completa e a compra não acontece.
//
// Mesmo desenho do `catalogoMat.ts`: leitura paginada com TTL longo no cache do
// client Omie. Leitura que dá certo é requisição CORRETA e não conta pro limite
// de bloqueio da app_key (§6 do REQUISITOS).

import type { ChamarFn } from "./catalogoMat";

// A descrição de todo comprado começa pelo próprio código ("COMDB P0381 018AC -
// DOBRADIÇA ..."), então o filtro por descrição traz o grupo inteiro; o prefixo
// do código descarta o que veio junto por coincidência (qualquer descrição com
// "COM" dentro, e são muitas: "COM FREIO", "COMPRIMENTO").
const FILTRO_DESCRICAO = "%COM%";
const PREFIXO_COM = "COM";
const REGISTROS_POR_PAGINA = 100;
// Teto de páginas: guarda contra um `total_de_paginas` estranho virar laço
// longo. Em 20/08/2026 o filtro devolvia 8 páginas (212 itens COM ativos).
const MAX_PAGINAS = 25;
const TTL_SEGUNDOS = 3600;

export interface ItemCom {
  codigo: string;
  descricao: string;
  /** Unidade do cadastro no Omie, normalizada ("UN", "M", "M²", "KG"). */
  unidade: string;
}

/**
 * Chave de busca: sem espaços e em caixa alta. O Omie devolve o código com
 * espaços ("COMDB P0381 018AC"), a BOM também, mas cadastros antigos aparecem
 * grudados — casar pela forma crua deixaria item cadastrado passar por "não
 * encontrado".
 */
export function chaveCom(codigo: string): string {
  return codigo.replace(/\s+/g, "").toUpperCase();
}

function texto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  return String(valor);
}

export interface CatalogoCom {
  itens: Map<string, ItemCom>;
  /**
   * `false` quando a varredura parou antes da última página anunciada pelo Omie
   * (página vazia no meio, ou o teto de páginas). Catálogo incompleto NÃO pode
   * virar a afirmação "este código não existe no Omie": mandaria alguém
   * recadastrar item que já existe. Quem consome decide o que fazer com isso.
   */
  completo: boolean;
}

/**
 * Itens COM ativos do Omie, indexados pela chave sem espaços. Erros do client
 * sobem para o chamador: sem catálogo não dá para dizer a unidade de nada, e
 * dizer "UN" por omissão seria inventar a unidade de compra.
 */
export async function listarCatalogoCom(
  chamar: ChamarFn,
  opcoes: { revalidar?: boolean } = {},
): Promise<CatalogoCom> {
  const itens = new Map<string, ItemCom>();
  let completo = false;

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const resp = await chamar(
      "geral/produtos/",
      "ListarProdutos",
      {
        pagina,
        registros_por_pagina: REGISTROS_POR_PAGINA,
        apenas_importado_api: "N",
        filtrar_apenas_omiepdv: "N",
        filtrar_apenas_descricao: FILTRO_DESCRICAO,
      },
      { ttlSeconds: TTL_SEGUNDOS, revalidar: opcoes.revalidar },
    );
    // Resposta vazia no meio da varredura: o client devolve null em EMPTY /
    // NOT_FOUND do Omie. Para de ler, mas o catálogo fica marcado incompleto.
    if (!resp) break;

    const lista = resp.produto_servico_cadastro;
    if (Array.isArray(lista)) {
      for (const registro of lista as Record<string, unknown>[]) {
        const codigo = texto(registro.codigo)?.trim();
        if (!codigo || !codigo.toUpperCase().startsWith(PREFIXO_COM)) continue;
        if (texto(registro.inativo)?.toUpperCase() === "S") continue;
        if (texto(registro.bloqueado)?.toUpperCase() === "S") continue;
        itens.set(chaveCom(codigo), {
          codigo,
          descricao: texto(registro.descricao) ?? "",
          unidade: (texto(registro.unidade) ?? "").trim().toUpperCase(),
        });
      }
    }

    const totalPaginas = Number(resp.total_de_paginas ?? 1);
    if (!Number.isFinite(totalPaginas) || pagina >= totalPaginas) {
      completo = true;
      break;
    }
  }

  return { itens, completo };
}

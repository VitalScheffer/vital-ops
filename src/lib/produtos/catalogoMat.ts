// Catálogo de MATÉRIA-PRIMA (itens "MAT...") lido do Omie.
//
// São poucas dezenas de itens e mudam raramente, então não vale uma tabela local
// pra sincronizar (e ficar desatualizada). Uma leitura paginada com TTL longo no
// cache do client Omie resolve: leitura que dá certo é requisição CORRETA e não
// conta pro limite de bloqueio da app_key (§6 do REQUISITOS).

import type { ChamarOptions, OmiePayload } from "@/lib/omie/client";
import { indexarCatalogo, type ItemMat, type ProdutoMatBruto } from "./materiaPrima";

export type ChamarFn = (
  path: string,
  call: string,
  param: OmiePayload,
  options?: ChamarOptions,
) => Promise<OmiePayload | null>;

// Todo cadastro de matéria-prima tem a descrição começando pelo próprio código
// ("MATCH 00300 IN430 - CHAPA ..."), então filtrar a descrição por "MAT" traz o
// grupo inteiro; o prefixo do código descarta o que veio junto por coincidência
// (ex.: um produto qualquer com "AUTOMATICO" na descrição).
const FILTRO_DESCRICAO = "%MAT%";
const PREFIXO_MAT = "MAT";
const REGISTROS_POR_PAGINA = 100;
// Teto de páginas: guarda contra um `total_de_paginas` estranho virar laço longo.
const MAX_PAGINAS = 20;
const TTL_SEGUNDOS = 3600;

function texto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  return String(valor);
}

/**
 * Lista os itens MAT cadastrados no Omie, já interpretados (geometria, liga e
 * marcação de cadastro contraditório). Erros do client sobem para o chamador
 * decidir — sem catálogo não dá pra sugerir matéria-prima nenhuma, e sugerir
 * errado é pior do que não sugerir.
 */
export async function listarCatalogoMat(
  chamar: ChamarFn,
  // `revalidar`: releitura pedida na tela (botão de recarregar), para pegar um
  // cadastro feito no Omie agora sem esperar o TTL. O piso de 60s da própria
  // Omie continua valendo, e quem cuida dele é o client.
  opcoes: { revalidar?: boolean } = {},
): Promise<ItemMat[]> {
  const brutos: ProdutoMatBruto[] = [];
  let pagina = 1;

  for (; pagina <= MAX_PAGINAS; pagina++) {
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
    if (!resp) break;

    const lista = resp.produto_servico_cadastro;
    if (Array.isArray(lista)) {
      for (const registro of lista as OmiePayload[]) {
        const codigo = texto(registro.codigo)?.trim();
        if (!codigo || !codigo.startsWith(PREFIXO_MAT)) continue;
        if (texto(registro.inativo)?.toUpperCase() === "S") continue;
        if (texto(registro.bloqueado)?.toUpperCase() === "S") continue;
        brutos.push({
          codigo,
          descricao: texto(registro.descricao) ?? "",
          unidade: texto(registro.unidade)?.trim(),
        });
      }
    }

    const totalPaginas = Number(resp.total_de_paginas ?? 1);
    if (!Number.isFinite(totalPaginas) || pagina >= totalPaginas) break;
  }

  return indexarCatalogo(brutos);
}

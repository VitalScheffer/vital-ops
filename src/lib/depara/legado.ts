// De onde sai a fila do De/Para: os cadastros ANTIGOS que ainda seguram saldo.
//
// A pergunta que a tela responde é "o material está parado em qual código
// velho?", então a fila não sai do catálogo inteiro: sai da POSIÇÃO DE ESTOQUE
// do local escolhido (`ListarPosEstoque` sem lista de produtos devolve tudo que
// tem saldo ali, paginado). Isso troca uma varredura do catálogo completo por
// ~10 leituras e já entrega o saldo, que é o que ordena a fila.
//
// Módulo PURO: recebe `chamar` por parâmetro.

import { blocosDoCodigo } from "@/lib/bom/bomParser";
import type { OmiePayload } from "@/lib/omie/client";
import { lerEspecificacao, parteDescritiva } from "@/lib/produtos/materiaPrima";
import type { ChamarFn } from "@/lib/estoque/omieEstoque";
import { buscarProdutosPorId } from "@/lib/estoque/omieOp";
import type { ItemLegado } from "./depara";

const REGISTROS_POR_PAGINA = 100;
// Teto de páginas: em 28/08/2026 o Estoque de Matéria-Prima tinha 961 itens com
// saldo (10 páginas). O teto guarda contra um total estranho virar laço longo.
const MAX_PAGINAS = 25;

function texto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  return String(valor);
}

function numero(valor: unknown): number | undefined {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * O código já está no padrão novo (nada a converter).
 *
 * O padrão novo é o 5-5-5 ("MATCH 00060 IN430", "CREHS SM001 I0POL"), e é isso
 * que `blocosDoCodigo` reconhece: 15 caracteres sem espaço. Filtrar por prefixo
 * ("começa com MAT") deixaria passar submontagem e peça, que também são código
 * novo e não têm para onde ser convertidas.
 */
export function ehCodigoNovo(codigo: string): boolean {
  return blocosDoCodigo(String(codigo ?? "")) !== null;
}

export interface ItemPosicao extends ItemLegado {
  idProd: string;
  cmc: number;
}

/**
 * Cadastros ATIVOS com saldo no local, já filtrados para o que faz sentido
 * converter.
 *
 * Três filtros, nesta ordem (os dois primeiros são locais e de graça; o
 * terceiro custa leitura, então só roda no que sobrou):
 *
 *  1. código fora do padrão novo 5-5-5 — quem já é MAT/COM/SBM/PCA não tem
 *     para onde ir;
 *  2. a descrição precisa se ler como matéria-prima (chapa, tubo, trefilado).
 *     É o mesmo `lerEspecificacao` do casamento, e é ele que mantém caneta
 *     esferográfica e papel sulfite fora da fila sem depender de uma lista de
 *     exceções escrita à mão;
 *  3. cadastro ATIVO e não bloqueado. A posição de estoque não diz nada sobre
 *     isso: item inativo com sobra de saldo continua aparecendo lá, e revisar
 *     De/Para de cadastro morto é trabalho jogado fora.
 *
 * O passo 3 traz junto a UNIDADE do cadastro, que a posição de estoque também
 * não devolve. Sem ela, o aviso de "a unidade muda de M² para KG" nunca
 * dispararia — a fila mostraria o casamento como se não houvesse nada a
 * conferir, que é exatamente o erro que o De/Para existe para evitar.
 *
 * `cExibeTodos: "N"` traz só o que tem saldo. Aqui isso é seguro (o local tem
 * centenas de itens); é no filtro POR SKU que o "N" viraria fault de vazio.
 */
export async function listarLegadosComSaldo(
  codigoLocal: string,
  dataPosicao: string,
  chamar: ChamarFn,
  opcoes: { revalidar?: boolean } = {},
): Promise<ItemPosicao[]> {
  const candidatos: ItemPosicao[] = [];

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const resp = await chamar(
      "estoque/consulta/",
      "ListarPosEstoque",
      {
        nPagina: pagina,
        nRegPorPagina: REGISTROS_POR_PAGINA,
        dDataPosicao: dataPosicao,
        cExibeTodos: "N",
        codigo_local_estoque: Number(codigoLocal),
      },
      { ttlSeconds: 600, revalidar: opcoes.revalidar },
    );
    if (!resp) break;

    const produtos = resp.produtos;
    if (Array.isArray(produtos)) {
      for (const bruto of produtos as OmiePayload[]) {
        const codigo = texto(bruto.cCodigo)?.trim();
        const idProd = texto(bruto.nCodProd)?.trim();
        if (!codigo || !idProd || ehCodigoNovo(codigo)) continue;
        const descricao = texto(bruto.cDescricao)?.trim() ?? codigo;
        // A leitura da geometria roda sobre a DESCRIÇÃO SEM O CÓDIGO na frente.
        // Com o código junto, os dígitos dele entram como medida: "CREHI PC002
        // CCPTD - CHAPA DE FIXAÇÃO" viraria uma chapa de 2 mm que não existe.
        if (!lerEspecificacao(parteDescritiva(codigo, descricao))) continue;
        candidatos.push({
          codigo,
          idProd,
          descricao,
          saldo: numero(bruto.nSaldo) ?? 0,
          cmc: numero(bruto.nCMC) ?? 0,
        });
      }
    }

    const totalPaginas = numero(resp.nTotPaginas) ?? 1;
    if (pagina >= totalPaginas) break;
  }

  if (candidatos.length === 0) return candidatos;

  // Leitura em lote (50 ids por chamada) para saber quem está ativo e em qual
  // unidade. Cadastro que não voltar do Omie fica de fora: sem confirmar que
  // está ativo, ele não entra numa fila que decide de onde sai material.
  const cadastros = await buscarProdutosPorId(
    candidatos.map((item) => item.idProd),
    chamar,
  );

  return candidatos.flatMap((item) => {
    const cadastro = cadastros.get(item.idProd);
    if (!cadastro || cadastro.inativo || cadastro.bloqueado) return [];
    return [{ ...item, unidade: cadastro.unidade }];
  });
}

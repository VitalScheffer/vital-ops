import type { BomRow, EstruturaRel, Familia, ParsedItem, ParseResult } from "./types";

// Formato padrão de código de engenharia: 3 blocos de 5 caracteres (família,
// tipo+sequência, material/processo) separados por espaço, revisão opcional
// ("R00") e por fim " - descrição". Itens comprados (família começando com
// "COM") nunca têm bloco de revisão.
//
// O " - " antes da descrição é OPCIONAL porque o CAD às vezes exporta sem ele
// ("MSVCH SM004 ITPOL ESTRUTURA SUPERIOR", visto na BOM da MSVCH MT001 I0POL).
// Sem essa tolerância a linha virava erro e, pior, os filhos dela ("4.1", "4.2")
// perdiam o pai em silêncio na estrutura.
//
// A tolerância NÃO vale quando o que vem depois ainda parece um bloco de código
// seguido do hífen ("... ITSLD REV01 - CHAPA"): aí é revisão fora do padrão R00
// ou bloco a mais, e engolir isso colocaria "REV01 - " dentro da descrição
// cadastrada no Omie. Esse caso continua sendo erro para o usuário corrigir.
const CODE_PATTERN = /^(\S{5}) (\S{5}) (\S{5})(?: (R\d{2}))?(?: - | (?!\S{5} - ))(.+)$/;

export const DESCRICAO_MAX = 120;

// A célula da PEÇA pode vir com quebra de linha dentro (algumas BOMs do CAD
// quebram o texto no meio do código: "MCHUH SM001\nC0PTD R00 - ..."), com tab
// ou com espaço não separável (U+00A0). Como o padrão exige espaço simples
// entre os blocos, qualquer um desses fazia a linha inteira virar erro. Aqui
// todo espaço em branco vira um espaço só antes de conferir o padrão.
export function normalizarPeca(peca: string): string {
  return peca.replace(/\s+/g, " ").trim();
}

// Chave de deduplicação: ignora espaços. Assim um código gerado com espaços
// ("CREHS SM001 C0PTD") casa com o mesmo código sem espaços de um Omie antigo
// ("CREHSSM001C0PTD"), evitando recadastrar o item só por causa do formato.
function chaveCodigo(codigo: string): string {
  return codigo.replace(/\s+/g, "");
}

function classificarFamilia(
  familiaBloco: string,
  tipoBloco: string,
  materialBloco: string,
): Familia | null {
  if (familiaBloco.slice(0, 3) === "COM") return "COM - COMPONENTES";
  if (tipoBloco.slice(0, 2) === "SM") return "SBM - SUBMONTAGEM";
  if (tipoBloco.slice(0, 2) === "PC") {
    return materialBloco.slice(-3) === "SLD" ? "PCF - PEÇAS FABRICADAS" : "PCA - PEÇAS ACABADAS";
  }
  return null;
}

interface CodigoInfo {
  codigo: string;
  descricao: string;
  familia: Familia | null;
}

/**
 * Quebra um código 5-5-5 nos três blocos. Aceita com ou sem os espaços
 * separadores ("MSVCH PC001 ITSLD" e "MSVCHPC001ITSLD"), porque o Omie devolve
 * os dois formatos. Retorna null se não tiver exatamente 15 caracteres úteis.
 */
export function blocosDoCodigo(codigo: string): [string, string, string] | null {
  const limpo = codigo.replace(/\s+/g, "");
  if (limpo.length !== 15) return null;
  return [limpo.slice(0, 5), limpo.slice(5, 10), limpo.slice(10, 15)];
}

/** `true` quando o código é de uma PEÇA (2º bloco começa com "PC"). */
export function ehPeca(codigo: string): boolean {
  const blocos = blocosDoCodigo(codigo);
  return blocos !== null && blocos[1].slice(0, 2) === "PC";
}

// Extrai o código 5-5-5 (com espaço), a descrição e a família de uma linha de
// peça já sem espaços das pontas. Retorna null se não bater com o padrão.
function extrairCodigo(pecaTrim: string): CodigoInfo | null {
  const match = CODE_PATTERN.exec(pecaTrim);
  if (!match) return null;
  const [, familiaBloco, tipoBloco, materialBloco, , descricao] = match;
  return {
    codigo: `${familiaBloco} ${tipoBloco} ${materialBloco}`,
    descricao: descricao.trim(),
    familia: classificarFamilia(familiaBloco, tipoBloco, materialBloco),
  };
}

/**
 * Código 5-5-5 e descrição de uma célula de PEÇA da BOM, ou `null` quando a
 * linha não bate no padrão. Exposto para quem precisa das duas informações sem
 * passar pelo `parseBom` inteiro (ex.: a matéria-prima, que trabalha por linha).
 */
export function extrairCodigoDaPeca(peca: string): { codigo: string; descricao: string } | null {
  const info = extrairCodigo(normalizarPeca(peca));
  return info ? { codigo: info.codigo, descricao: info.descricao } : null;
}

function parseLinha(row: BomRow): ParsedItem {
  const info = extrairCodigo(normalizarPeca(row.peca));

  if (!info) {
    return {
      linha: row.linha,
      raw: row.peca,
      codigo: "",
      descricaoProduto: "",
      familia: null,
      status: "erro",
      motivoErro: 'Não bate com o padrão esperado: "FAMIL TIPO+ MATER [R00] - Descrição".',
    };
  }

  const { codigo, familia } = info;
  // Descrição (coluna D) = código 5-5-5 + " - " + descrição da peça.
  const descricaoProduto = `${codigo} - ${info.descricao}`;

  if (descricaoProduto.length > DESCRICAO_MAX) {
    return {
      linha: row.linha,
      raw: row.peca,
      codigo,
      descricaoProduto,
      familia,
      status: "erro",
      motivoErro: `Descrição ficaria com ${descricaoProduto.length} caracteres (máximo ${DESCRICAO_MAX} no Omie). Encurte a descrição na BOM.`,
    };
  }

  return { linha: row.linha, raw: row.peca, codigo, descricaoProduto, familia, status: "novo" };
}

/**
 * @param existingCodes Códigos já cadastrados anteriormente (de um Omie_Produtos.xlsx
 * existente), para não duplicar cadastro entre importações de projetos diferentes.
 */
export function parseBom(rows: BomRow[], existingCodes: Iterable<string> = []): ParseResult {
  const vistos = new Set<string>();
  for (const c of existingCodes) vistos.add(chaveCodigo(c));
  const itens: ParsedItem[] = [];

  for (const row of rows) {
    if (!row.peca.trim()) continue;
    const item = parseLinha(row);

    if (item.status === "novo") {
      const chave = chaveCodigo(item.codigo);
      if (vistos.has(chave)) {
        itens.push({ ...item, status: "duplicado" });
        continue;
      }
      vistos.add(chave);
    }
    itens.push(item);
  }

  return {
    itens,
    novos: itens.filter((i) => i.status === "novo"),
    duplicados: itens.filter((i) => i.status === "duplicado"),
    erros: itens.filter((i) => i.status === "erro"),
  };
}

// Número da linha de topo da MONTAGEM raiz. A raiz não é uma linha da planilha
// (ela já está cadastrada no Omie), então precisa de um número próprio que nunca
// colida com a numeração do CAD.
export const NUMERO_RAIZ = "0";

/**
 * Monta a estrutura pai→filho a partir da numeração hierárquica da coluna Nº:
 * um número com ponto (ex.: "1.2") é filho do número antes do último ponto
 * ("1"). Cada relação vira uma linha na aba Omie_Produtos_Estrutura.
 * Linhas sem código válido (que não batem no padrão) ficam de fora.
 *
 * @param codigoRaiz Código da MONTAGEM já cadastrada no Omie que recebe a árvore
 * inteira. Informado, cada linha de NÍVEL TOPO ("1", "2", ...) vira filha dela —
 * é o que evita pendurar item por item na mão dentro da montagem existente.
 */
export function parseEstrutura(rows: BomRow[], codigoRaiz?: string): EstruturaRel[] {
  // 1ª passada: mapa numero -> código (só das linhas com código válido).
  const codigoPorNumero = new Map<string, string>();
  for (const row of rows) {
    const numero = row.numero.trim();
    if (!numero) continue;
    const info = extrairCodigo(normalizarPeca(row.peca));
    if (info) codigoPorNumero.set(numero, info.codigo);
  }

  const raiz = codigoRaiz?.trim();
  const rels: EstruturaRel[] = [];

  // 2ª passada: cada linha "X.Y" é filho do pai "X"; as de nível topo são filhas
  // da montagem raiz, quando informada.
  for (const row of rows) {
    const numero = row.numero.trim();
    if (!numero) continue;
    const info = extrairCodigo(normalizarPeca(row.peca));
    if (!info) continue;

    if (!numero.includes(".")) {
      // A própria montagem raiz pode aparecer como linha da planilha: nesse caso
      // ela não é filha de si mesma.
      if (!raiz || chaveCodigo(info.codigo) === chaveCodigo(raiz)) continue;
      rels.push({
        numeroPai: NUMERO_RAIZ,
        numeroFilho: numero,
        codigoPai: raiz,
        codigoFilho: info.codigo,
        descricaoFilho: info.descricao,
        quantidade: row.quantidade,
        origem: "raiz",
      });
      continue;
    }

    const numeroPai = numero.slice(0, numero.lastIndexOf("."));
    const codigoPai = codigoPorNumero.get(numeroPai);
    if (!codigoPai) continue; // pai sem código válido -> não dá pra relacionar
    rels.push({
      numeroPai,
      numeroFilho: numero,
      codigoPai,
      codigoFilho: info.codigo,
      descricaoFilho: info.descricao,
      quantidade: row.quantidade,
      origem: "bom",
    });
  }
  return rels;
}

/**
 * Linhas que TÊM código válido e são filhas pela numeração ("1.2"), mas cujo pai
 * não pôde ser resolvido (a linha do pai não existe ou o código dela não bate no
 * padrão). Sem isso a relação some em silêncio na `parseEstrutura` e ninguém
 * percebe que aquele pedaço da árvore não foi pro Omie.
 */
export function orfaosDeEstrutura(rows: BomRow[]): { numero: string; codigo: string; numeroPai: string }[] {
  const comCodigo = new Set<string>();
  for (const row of rows) {
    const numero = row.numero.trim();
    if (numero && extrairCodigo(normalizarPeca(row.peca))) comCodigo.add(numero);
  }

  const orfaos: { numero: string; codigo: string; numeroPai: string }[] = [];
  for (const row of rows) {
    const numero = row.numero.trim();
    if (!numero.includes(".")) continue;
    const info = extrairCodigo(normalizarPeca(row.peca));
    if (!info) continue;
    const numeroPai = numero.slice(0, numero.lastIndexOf("."));
    if (!comCodigo.has(numeroPai)) orfaos.push({ numero, codigo: info.codigo, numeroPai });
  }
  return orfaos;
}

import type { BomRow, EstruturaRel, Familia, ParsedItem, ParseResult } from "./types";

// Formato padrão de código de engenharia: 3 blocos de 5 caracteres (família,
// tipo+sequência, material/processo) separados por espaço, revisão opcional
// ("R00") e por fim " - descrição". Itens comprados (família começando com
// "COM") nunca têm bloco de revisão.
const CODE_PATTERN = /^(\S{5}) (\S{5}) (\S{5})(?: (R\d{2}))? - (.+)$/;

export const DESCRICAO_MAX = 120;

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

function parseLinha(row: BomRow): ParsedItem {
  const info = extrairCodigo(row.peca.trim());

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

/**
 * Monta a estrutura pai→filho a partir da numeração hierárquica da coluna Nº:
 * um número com ponto (ex.: "1.2") é filho do número antes do último ponto
 * ("1"). Cada relação vira uma linha na aba Omie_Produtos_Estrutura.
 * Linhas sem código válido (que não batem no padrão) ficam de fora.
 */
export function parseEstrutura(rows: BomRow[]): EstruturaRel[] {
  // 1ª passada: mapa numero -> código (só das linhas com código válido).
  const codigoPorNumero = new Map<string, string>();
  for (const row of rows) {
    const numero = row.numero.trim();
    if (!numero) continue;
    const info = extrairCodigo(row.peca.trim());
    if (info) codigoPorNumero.set(numero, info.codigo);
  }

  // 2ª passada: cada linha "X.Y" é filho do pai "X".
  const rels: EstruturaRel[] = [];
  for (const row of rows) {
    const numero = row.numero.trim();
    if (!numero.includes(".")) continue; // nível de topo, não é filho
    const info = extrairCodigo(row.peca.trim());
    if (!info) continue;
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
    });
  }
  return rels;
}

/**
 * Cria o primeiro nível de uma BOM dentro de uma montagem que JÁ existe no
 * Omie. A hierarquia original é preservada por `parseEstrutura`: aqui entram
 * apenas os itens de topo (Nº sem ponto), como filhos da montagem informada.
 *
 * O código da montagem é digitado pelo usuário porque o nome do arquivo não
 * é uma fonte confiável de identidade. A existência desse pai é validada no
 * servidor antes de qualquer escrita no Omie.
 */
export function criarEstruturaDaMontagemDestino(rows: BomRow[], codigoMontagem: string): EstruturaRel[] {
  const codigoPai = codigoMontagem.trim();
  if (!codigoPai) return [];

  const chavePai = chaveCodigo(codigoPai);
  const rels: EstruturaRel[] = [];

  for (const row of rows) {
    const numeroFilho = row.numero.trim();
    if (!numeroFilho || numeroFilho.includes(".")) continue;

    const info = extrairCodigo(row.peca.trim());
    // Evita uma estrutura circular se a montagem destino também aparecer como
    // a linha de topo da planilha.
    if (!info || chaveCodigo(info.codigo) === chavePai) continue;

    rels.push({
      numeroPai: "MONTAGEM_DESTINO",
      numeroFilho,
      codigoPai,
      codigoFilho: info.codigo,
      descricaoFilho: info.descricao,
      quantidade: row.quantidade,
    });
  }

  return rels;
}

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as XLSX from "xlsx";

import type { EstruturaRel, ParsedItem } from "./types";

const SHEET_NAME = "Omie_Produtos";
const SHEET_ESTRUTURA = "Omie_Produtos_Estrutura";
// Linhas 1-5 do template são cabeçalho/instrução do Omie; dado começa na linha 6.
const FIRST_DATA_ROW = 6;
// A linha 10006 é o marcador "limite" do próprio template (fim do intervalo
// válido B6:AN10005). Não escrevemos além de 10005.
const LAST_DATA_ROW = 10005;

// Caminho servido a partir de public/ (mesmo arquivo do omie-bom-converter).
const TEMPLATE_URL = "/templates/Omie_Produtos_v1_9_5.xlsx";

const NCM_FIXO = "9999.99.99";
const UNIDADE_FIXA = "UN";
const TIPO_PRODUTO_FIXO = "04";

// Colunas da aba Omie_Produtos que preenchemos (letra da coluna na planilha).
const COL_CODIGO = "C";
const COL_DESCRICAO = "D";
const COL_NCM = "E";
const COL_UNIDADE = "I";
const COL_FAMILIA = "J";
const COL_TIPO = "AC";

// Colunas da aba Omie_Produtos_Estrutura (pai / filho / quantidade / local).
const COL_EST_PAI = "B";
const COL_EST_FILHO = "C";
const COL_EST_QTD = "D";
const COL_EST_LOCAL = "E";

export interface ResultadoEscrita {
  linhaInicial1Indexed: number;
  quantidadeEscrita: number;
}

// --- Leitura dos bytes do arquivo ---

export async function lerBytesTemplate(): Promise<Uint8Array> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error("Não consegui carregar o template padrão do Omie (public/templates).");
  return new Uint8Array(await res.arrayBuffer());
}

export async function lerBytesArquivo(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

// --- Dedup: códigos já cadastrados (coluna C) ---
// Usa o SheetJS só para LER a coluna C (ele resolve shared/inline strings de
// qualquer arquivo, inclusive um Omie salvo pelo Excel). A escrita NÃO passa
// pelo SheetJS — ver preencherProdutos.
export function extrairCodigosExistentes(bytes: Uint8Array): string[] {
  // Mesmo cuidado do lerBomDeArquivo: se o arquivo não for um Excel legível, o
  // SheetJS estoura erro cru (ex.: "slurp"). Aqui é o slot do "Omie atual".
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: "array", sheets: SHEET_NAME });
  } catch {
    throw new Error(
      "Não consegui ler este arquivo do Omie. Confira se é o Omie_Produtos.xlsx exportado do Omie " +
        "(um Excel válido, não protegido por senha e não corrompido).",
    );
  }
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(
      `A aba "${SHEET_NAME}" não foi encontrada neste arquivo. Confira se é o template/arquivo certo do Omie.`,
    );
  }
  if (!sheet["!ref"]) return [];

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const colC = XLSX.utils.decode_col(COL_CODIGO);
  const codigos: string[] = [];
  for (let r = FIRST_DATA_ROW - 1; r <= range.e.r; r++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c: colC })];
    const valor = cell?.v != null ? String(cell.v).trim() : "";
    if (!valor) break; // dados são contíguos a partir da linha 6
    codigos.push(valor);
  }
  return codigos;
}

// --- Escrita cirúrgica ---
// O template do Omie já traz ~10.000 linhas PRÉ-FORMATADAS (estilo, dropdowns de
// validação, bordas, imagens, 13 abas). Regravar o arquivo pelo SheetJS (versão
// grátis) descartaria tudo isso — o resultado sai "com cara diferente" do
// original. Em vez disso, abrimos o .xlsx (que é um zip), preenchemos os VALORES
// dentro das células que já existem na aba Omie_Produtos (preservando o estilo
// de cada uma) e fechamos o zip. O resultado é idêntico ao template, como se o
// usuário tivesse digitado os dados na planilha oficial.

function escaparXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function resolverCaminhoAba(zip: Record<string, Uint8Array>, sheetName: string): string {
  const wbXml = strFromU8(zip["xl/workbook.xml"]);
  const sheetTag = wbXml.match(new RegExp(`<sheet\\b[^>]*\\bname="${sheetName}"[^>]*/?>`));
  const rid = sheetTag?.[0].match(/r:id="(rId\d+)"/)?.[1];
  if (!rid) throw new Error(`A aba "${sheetName}" não foi encontrada no arquivo do Omie.`);

  const relsXml = strFromU8(zip["xl/_rels/workbook.xml.rels"]);
  const target = relsXml.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1];
  if (!target) throw new Error(`Não consegui localizar a planilha interna da aba "${sheetName}".`);
  return "xl/" + target.replace(/^\/+/, "");
}

// Menor linha >= 6 cuja célula da coluna informada está vazia (self-closed no
// XML, ex.: `<c r="C6" s="63"/>`). Células preenchidas têm filho (`<is>`/`<v>`)
// e terminam em `>`, não `/>`, então não casam — o que dá a primeira linha livre.
function primeiraLinhaVazia(sheetXml: string, col: string): number {
  const re = new RegExp(`<c r="${col}(\\d+)"[^>]*?/>`, "g");
  let min = Infinity;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sheetXml)) !== null) {
    const r = Number(m[1]);
    if (r >= FIRST_DATA_ROW && r < min) min = r;
  }
  return min === Infinity ? -1 : min;
}

// Injeta os valores nas células que já existem (self-closed), preservando o
// atributo de estilo `s="..."` e usando inline string (mantém texto como texto).
function aplicarValores(sheetXml: string, valores: Map<string, string>): string {
  return sheetXml.replace(/<c r="([A-Z]+\d+)"([^>]*?)\/>/g, (full, ref: string, attrs: string) => {
    const valor = valores.get(ref);
    if (valor === undefined) return full;
    return `<c r="${ref}"${attrs} t="inlineStr"><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`;
  });
}

function formatarQtd(q: number | null): string {
  return q == null ? "" : String(q);
}

export function preencherProdutos(
  bytes: Uint8Array,
  itensNovos: ParsedItem[],
): { bytes: Uint8Array; resultado: ResultadoEscrita } {
  const zip = unzipSync(bytes);
  const sheetPath = resolverCaminhoAba(zip, SHEET_NAME);
  let sheetXml = strFromU8(zip[sheetPath]);

  const inicio = primeiraLinhaVazia(sheetXml, COL_CODIGO);
  if (inicio < 0 || inicio + itensNovos.length - 1 > LAST_DATA_ROW) {
    const capacidade = LAST_DATA_ROW - FIRST_DATA_ROW + 1;
    throw new Error(`Não há linhas vazias suficientes no arquivo do Omie (capacidade de ${capacidade} produtos).`);
  }

  // Mapa "referência da célula" -> "valor" (uma passada só sobre o XML).
  const valores = new Map<string, string>();
  itensNovos.forEach((item, i) => {
    const r = inicio + i;
    valores.set(`${COL_CODIGO}${r}`, item.codigo);
    valores.set(`${COL_DESCRICAO}${r}`, item.descricaoProduto);
    valores.set(`${COL_NCM}${r}`, NCM_FIXO);
    valores.set(`${COL_UNIDADE}${r}`, UNIDADE_FIXA);
    if (item.familia) valores.set(`${COL_FAMILIA}${r}`, item.familia);
    valores.set(`${COL_TIPO}${r}`, TIPO_PRODUTO_FIXO);
  });

  sheetXml = aplicarValores(sheetXml, valores);
  zip[sheetPath] = strToU8(sheetXml);
  const out = zipSync(zip);
  return { bytes: out, resultado: { linhaInicial1Indexed: inicio, quantidadeEscrita: itensNovos.length } };
}

/**
 * Preenche a aba Omie_Produtos_Estrutura com as relações pai→filho.
 * `localEstoque` é opcional (o Omie marca como obrigatório na estrutura, mas
 * deixamos o usuário informar); se vazio, a coluna fica em branco.
 * Se não houver relações, devolve os bytes intactos.
 */
export function preencherEstrutura(
  bytes: Uint8Array,
  rels: EstruturaRel[],
  localEstoque?: string,
): { bytes: Uint8Array; resultado: ResultadoEscrita } {
  if (rels.length === 0) {
    return { bytes, resultado: { linhaInicial1Indexed: -1, quantidadeEscrita: 0 } };
  }

  const zip = unzipSync(bytes);
  const sheetPath = resolverCaminhoAba(zip, SHEET_ESTRUTURA);
  let sheetXml = strFromU8(zip[sheetPath]);

  const inicio = primeiraLinhaVazia(sheetXml, COL_EST_PAI);
  if (inicio < 0 || inicio + rels.length - 1 > LAST_DATA_ROW) {
    const capacidade = LAST_DATA_ROW - FIRST_DATA_ROW + 1;
    throw new Error(`Não há linhas vazias suficientes na aba de estrutura (capacidade de ${capacidade} relações).`);
  }

  const local = localEstoque?.trim();
  const valores = new Map<string, string>();
  rels.forEach((rel, i) => {
    const r = inicio + i;
    valores.set(`${COL_EST_PAI}${r}`, rel.codigoPai);
    valores.set(`${COL_EST_FILHO}${r}`, rel.codigoFilho);
    valores.set(`${COL_EST_QTD}${r}`, formatarQtd(rel.quantidade));
    if (local) valores.set(`${COL_EST_LOCAL}${r}`, local);
  });

  sheetXml = aplicarValores(sheetXml, valores);
  zip[sheetPath] = strToU8(sheetXml);
  const out = zipSync(zip);
  return { bytes: out, resultado: { linhaInicial1Indexed: inicio, quantidadeEscrita: rels.length } };
}

export function bytesParaBlob(bytes: Uint8Array): Blob {
  // Cópia via .slice() garante um ArrayBuffer "puro" (não SharedArrayBuffer) pro Blob.
  return new Blob([bytes.slice()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

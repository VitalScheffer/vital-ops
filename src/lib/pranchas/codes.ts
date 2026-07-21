// Casamento de códigos de engenharia para o compilador de pranchas.
//
// Convivem dois formatos:
//
// ATUAL (5-5-5): três blocos de cinco caracteres — família, tipo+sequência e
// material/processo — com revisão opcional no fim:
//   CREHS PC001 CCSLD R00     CME4I SM009 ACPTD (sem revisão)
// É o mesmo formato lido pelo módulo de Produtos (ver lib/bom/bomParser.ts). O
// código que vai para o Omie são os três blocos; o "R##" é só a revisão do
// desenho e não entra no cadastro.
//
// ANTIGO: prefixo + tipo/sequência + bloco "C##" opcional + revisão:
//   C4MEC P01 C00 R00         MDMI SM13 R00
//
// O bloco de material faz parte da IDENTIDADE da peça, não é decoração:
// "CREHS PC001 CCSLD" (carbono) e "CREHS PC001 ICSLD" (inox) são peças
// diferentes que compartilham a sequência. Por isso a chave de família inclui
// os três blocos — juntar por prefixo+sequência imprimiria o desenho errado.
//
// Itens comprados têm família começando com "COM" (COMDB P0381 018AC) e casam
// com o mesmo padrão dos desenhos, então precisam ser excluídos explicitamente
// da lista de pranchas. Comprados sem código nenhum (PORCA M12, RODIZIO 3POL.)
// são naturalmente ignorados pelos padrões.

export type Mode = "exact" | "latest";
export type MatchStatus = "ok" | "new" | "old" | "warn" | "norev" | "miss";

export interface DrawingCode {
  familia: string; // bloco 1: CREHS, C4MEC, COMDB
  tipo: string; // bloco 2: PC001, SM001, P01, SM13
  material: string; // bloco 3: CCSLD, C00; "" quando o formato antigo não traz
  r: number; // revisão; -1 quando o código não declara revisão
  key: string; // identidade sem revisão: "CREHS PC001 CCSLD"
  raw: string; // forma canônica com revisão: "CREHS PC001 CCSLD R00"
  desc?: string; // descrição da peça (cosmética, não entra no casamento)
  comercial: boolean; // família "COM*": item comprado, não é desenho
}

// Formato atual: três blocos de exatamente 5 alfanuméricos, "C##" opcional
// (resquício de desenhos migrados) e "R##" opcional.
const RX_ATUAL = /\b([A-Z0-9]{5})\s+([A-Z0-9]{5})\s+([A-Z0-9]{5})(?:\s+C\d{1,3})?(?:\s+R(\d{1,3}))?\b/gi;

// Formato antigo: exige o "R##" no fim, que é o que o distingue de texto solto.
const RX_ANTIGO = /\b([A-Z][A-Z0-9]{1,5})\s+([A-Z]{1,3})(\d{1,4})\s+(?:C(\d{1,3})\s+)?R(\d{1,3})\b/gi;

// No formato atual o bloco 2 de um DESENHO é sempre letras + sequência
// (PC001, SM001, MT005). Comprados fogem disso (P0381, 04040, PLA15), e é por
// isso que só aceitamos um bloco 2 fora do padrão quando a família é "COM".
// Sem essa checagem, texto solto de 3 palavras de 5 letras viraria "código".
const TIPO_DESENHO = /^[A-Z]{1,3}\d{2,4}$/;

function pad2(n: number): string {
  return n < 0 ? "" : String(n).padStart(2, "0");
}

// Normaliza um texto (linha de BOM ou nome de arquivo) antes de casar: troca
// underscores por espaço para que "MDMI_P22_C00_R00" case igual a "MDMI P22 C00 R00".
export function normalizar(texto: string): string {
  return texto.replace(/_+/g, " ").replace(/\s{2,}/g, " ");
}

function montar(familia: string, tipo: string, material: string, r: number): DrawingCode {
  const key = material ? `${familia} ${tipo} ${material}` : `${familia} ${tipo}`;
  return {
    familia,
    tipo,
    material,
    r,
    key,
    raw: r >= 0 ? `${key} R${pad2(r)}` : key,
    comercial: familia.startsWith("COM"),
  };
}

// Descrição: o texto após " - " até a coluna de custo (número decimal), o
// próximo código ou o fim da linha.
function lerDesc(depois: string): string | undefined {
  const dm = depois.match(/^\s*-\s*(.+?)(?=\s+\d+[.,]\d|\s+[A-Z0-9]{5}\s+[A-Z0-9]{5}\s|$)/);
  return dm ? dm[1].trim().replace(/\s{2,}/g, " ").slice(0, 70) : undefined;
}

/**
 * Extrai todos os itens com código (desenhos E comprados) na ordem em que
 * aparecem, sem repetir. Um mesmo texto nunca mistura os dois formatos, então o
 * formato antigo só é tentado quando o atual não achou nada — isso evita que
 * "CREHS PC001 CCSLD C00 R00" gere um segundo código fantasma ("CCSLD C00").
 */
export function extractItems(texto: string): DrawingCode[] {
  const alvo = normalizar(texto);
  const saida: DrawingCode[] = [];
  const vistos = new Set<string>();

  RX_ATUAL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RX_ATUAL.exec(alvo))) {
    const familia = m[1].toUpperCase();
    const tipo = m[2].toUpperCase();
    const material = m[3].toUpperCase();
    if (!familia.startsWith("COM") && !TIPO_DESENHO.test(tipo)) continue;
    const code = montar(familia, tipo, material, m[4] === undefined ? -1 : parseInt(m[4], 10));
    if (vistos.has(code.key)) continue;
    vistos.add(code.key);
    code.desc = lerDesc(alvo.slice(m.index + m[0].length));
    saida.push(code);
  }

  if (saida.length > 0) return saida;

  RX_ANTIGO.lastIndex = 0;
  while ((m = RX_ANTIGO.exec(alvo))) {
    const familia = m[1].toUpperCase();
    const tipo = `${m[2].toUpperCase()}${pad2(parseInt(m[3], 10))}`;
    const material = m[4] !== undefined ? `C${pad2(parseInt(m[4], 10))}` : "";
    const code = montar(familia, tipo, material, parseInt(m[5], 10));
    if (vistos.has(code.key)) continue;
    vistos.add(code.key);
    code.desc = lerDesc(alvo.slice(m.index + m[0].length));
    saida.push(code);
  }
  return saida;
}

/** Só os desenhos: exclui os itens comprados (família "COM*"). */
export function extractCodes(texto: string): DrawingCode[] {
  return extractItems(texto).filter((c) => !c.comercial);
}

/** Extrai o primeiro código de um trecho de texto. Retorna null se não casar. */
export function parseCode(texto: string): DrawingCode | null {
  return extractItems(texto)[0] ?? null;
}

/** Deriva o código de um nome de arquivo (sem extensão, underscores viram espaço). */
export function parseCodeFromFileName(fileName: string): DrawingCode | null {
  const code = parseCode(fileName.replace(/\.[^.]+$/, ""));
  return code && !code.comercial ? code : null;
}

export interface Candidate {
  code: DrawingCode;
}

export interface ChosenMatch {
  index: number; // posição do candidato escolhido no array recebido; -1 se nenhum
  status: MatchStatus;
  detail: string;
}

/**
 * Candidatos de um código = itens do índice com a mesma identidade (os três
 * blocos). Dentro de uma família só a revisão varia.
 */
export function candidatesFor<T extends Candidate>(code: DrawingCode, index: readonly T[]): T[] {
  return index.filter((f) => f.code.key === code.key);
}

function rotulo(c: DrawingCode): string {
  return c.r >= 0 ? `R${pad2(c.r)}` : "sem revisão";
}

/**
 * Escolhe qual candidato usar para um código do BOM.
 * "exact": exige a mesma revisão do BOM. "latest": pega sempre a mais nova.
 *
 * Desenho cujo nome de arquivo não traz revisão (98 dos 658 arquivos da pasta
 * de produção) é tratado como revisão única: casa com o que o BOM pedir, mas
 * sai marcado como "norev" para conferência antes de imprimir.
 */
export function chooseCandidate(
  code: DrawingCode,
  cands: readonly DrawingCode[],
  mode: Mode,
): ChosenMatch {
  if (cands.length === 0) {
    return { index: -1, status: "miss", detail: `nenhum PDF com código ${code.key}` };
  }

  // Mais nova primeiro; "sem revisão" (-1) fica por último.
  const ordenados = cands.map((code, index) => ({ code, index })).sort((a, b) => b.code.r - a.code.r);
  const maisNova = ordenados[0];
  const semRev = ordenados.find((o) => o.code.r < 0);
  const exata = ordenados.find((o) => o.code.r === code.r);

  if (mode === "latest") {
    if (maisNova.code.r === code.r) return { index: maisNova.index, status: "ok", detail: "" };
    if (maisNova.code.r < 0) {
      return { index: maisNova.index, status: "norev", detail: "o arquivo não declara revisão" };
    }
    return maisNova.code.r > code.r
      ? { index: maisNova.index, status: "new", detail: `BOM pede ${rotulo(code)}` }
      : { index: maisNova.index, status: "old", detail: `BOM pede ${rotulo(code)} (não existe na pasta)` };
  }

  if (exata) {
    const temMaisNova = maisNova.code.r > code.r;
    if (code.r < 0) {
      return { index: exata.index, status: "norev", detail: "nem o BOM nem o arquivo declaram revisão" };
    }
    return {
      index: exata.index,
      status: "ok",
      detail: temMaisNova ? `existe revisão mais nova: ${rotulo(maisNova.code)}` : "",
    };
  }

  if (semRev) {
    return {
      index: semRev.index,
      status: "norev",
      detail: `BOM pede ${rotulo(code)}; o arquivo não declara revisão`,
    };
  }

  return {
    index: maisNova.index,
    status: "warn",
    detail: `BOM pede ${rotulo(code)}; na pasta há: ${cands.map(rotulo).join(", ")}`,
  };
}

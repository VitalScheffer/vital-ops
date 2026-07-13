// Casamento de códigos de engenharia para o compilador de pranchas.
//
// O código de um desenho tem a forma "PREFIXO TIPO+SEQ [C##] R##", onde o
// prefixo é o projeto/módulo (ex.: C4MEC, C3SM, C3SE, GDPM, MDMI). Num mesmo
// BOM convivem prefixos diferentes (peças reaproveitadas de outros projetos),
// então o casamento NÃO pode fixar o prefixo: ele faz parte da identidade.
//
// Itens comprados (parafuso, porca, rodízio, atuador...) não têm o bloco
// "[C##] R##" e por isso são naturalmente ignorados pelo padrão.

export type Mode = "exact" | "latest";
export type MatchStatus = "ok" | "new" | "old" | "warn" | "miss";

export interface DrawingCode {
  prefix: string; // C4MEC, C3SM, GDPM, MDMI...
  type: string; // P, M, SM...
  num: number; // 1, 9, 13
  c: number; // versão/config; -1 quando ausente
  r: number; // revisão
  key: string; // chave de família: "PREFIXO TIPO##" (ex.: "C4MEC P01")
  raw: string; // forma canônica: "C4MEC P01 C00 R00"
  desc?: string; // descrição da peça (cosmética, não entra no casamento)
}

// PREFIXO (letra + 1..5 alfanuméricos) espaço TIPO(1..3 letras)+SEQ(dígitos)
// espaço [C##] R##. Case-insensitive; o "\s+" absorve underscores já trocados
// por espaço na normalização do nome de arquivo.
const RX = /([A-Z][A-Z0-9]{1,5})\s+([A-Z]{1,3})(\d{1,4})\s+(?:C(\d{1,3})\s+)?R(\d{1,3})/i;
const RX_GLOBAL = new RegExp(RX.source, "gi");

function pad2(n: number): string {
  return n < 0 ? "" : String(n).padStart(2, "0");
}

function canon(prefix: string, type: string, num: number, c: number, r: number): string {
  return `${prefix} ${type}${pad2(num)}${c >= 0 ? ` C${pad2(c)}` : ""} R${pad2(r)}`;
}

// Normaliza um texto (linha de BOM ou nome de arquivo) antes de casar: troca
// underscores por espaço para que "MDMI_P22_C00_R00" case igual a "MDMI P22 C00 R00".
export function normalizar(texto: string): string {
  return texto.replace(/_+/g, " ").replace(/\s{2,}/g, " ");
}

// Extrai o primeiro código de um trecho de texto. Retorna null se não casar.
export function parseCode(texto: string): DrawingCode | null {
  const m = RX.exec(normalizar(texto));
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const type = m[2].toUpperCase();
  const num = parseInt(m[3], 10);
  const c = m[4] !== undefined ? parseInt(m[4], 10) : -1;
  const r = parseInt(m[5], 10);
  return {
    prefix,
    type,
    num,
    c,
    r,
    key: `${prefix} ${type}${pad2(num)}`,
    raw: canon(prefix, type, num, c, r),
  };
}

// Deriva o código de um nome de arquivo (sem extensão, underscores viram espaço).
export function parseCodeFromFileName(fileName: string): DrawingCode | null {
  const semExt = fileName.replace(/\.[^.]+$/, "");
  return parseCode(semExt);
}

// Extrai todos os códigos distintos do texto do BOM, na ordem em que aparecem,
// com a descrição logo após o " - " de cada linha (até os números de custo/qtd
// ou o próximo código).
export function extractCodes(texto: string): DrawingCode[] {
  const alvo = normalizar(texto);
  const saida: DrawingCode[] = [];
  const vistos = new Set<string>();
  RX_GLOBAL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RX_GLOBAL.exec(alvo))) {
    const code = parseCode(m[0]);
    if (!code || vistos.has(code.raw)) continue;
    vistos.add(code.raw);
    const depois = alvo.slice(m.index + m[0].length);
    // Descrição: pega o texto após " - " até um número decimal (coluna de
    // custo), uma quantidade isolada seguida de novo código, ou o fim.
    const dm = depois.match(
      /^\s*-\s*(.+?)(?=\s+\d+[.,]\d|\s+[A-Z][A-Z0-9]{1,5}\s+[A-Z]{1,3}\d|$)/,
    );
    if (dm) code.desc = dm[1].trim().replace(/\s{2,}/g, " ").slice(0, 70);
    saida.push(code);
  }
  return saida;
}

export interface Candidate {
  code: DrawingCode;
}

export interface ChosenMatch {
  index: number; // posição do candidato escolhido no array recebido; -1 se nenhum
  status: MatchStatus;
  detail: string;
}

// Candidatos de um código = itens do índice com a mesma família (mesmo prefixo,
// tipo e número). A escolha entre eles depende de C/R e do modo.
export function candidatesFor<T extends Candidate>(code: DrawingCode, index: readonly T[]): T[] {
  return index.filter((f) => f.code.key === code.key);
}

// Escolhe qual candidato usar para um código do BOM, conforme o modo.
// "exact": exige a mesma revisão do BOM (senão avisa). "latest": pega sempre a
// revisão mais nova da pasta.
export function chooseCandidate(code: DrawingCode, cands: readonly DrawingCode[], mode: Mode): ChosenMatch {
  if (cands.length === 0) {
    return { index: -1, status: "miss", detail: `nenhum PDF com código ${code.key}` };
  }
  // Ordena por versão C e revisão R (mais nova primeiro), preservando o índice
  // original para devolver ao chamador.
  const ordenados = cands
    .map((code, index) => ({ code, index }))
    .sort((a, b) => b.code.c - a.code.c || b.code.r - a.code.r);
  const maisNova = ordenados[0];
  const exata = ordenados.find((o) => o.code.c === code.c && o.code.r === code.r);
  const temMaisNova = cands.some((f) => f.c > code.c || (f.c === code.c && f.r > code.r));

  if (mode === "latest") {
    if (maisNova.code.raw === code.raw) return { index: maisNova.index, status: "ok", detail: "" };
    const cmp = maisNova.code.c - code.c || maisNova.code.r - code.r;
    return cmp > 0
      ? { index: maisNova.index, status: "new", detail: `BOM pede ${code.raw}` }
      : { index: maisNova.index, status: "old", detail: `BOM pede ${code.raw} (não existe na pasta)` };
  }

  if (exata) {
    return {
      index: exata.index,
      status: "ok",
      detail: temMaisNova ? `existe revisão mais nova: ${maisNova.code.raw}` : "",
    };
  }
  return {
    index: maisNova.index,
    status: "warn",
    detail: `BOM pede ${code.raw}; na pasta há: ${cands.map((c) => c.raw).join(", ")}`,
  };
}

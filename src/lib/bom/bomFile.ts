import * as XLSX from "xlsx";

import { normalizarCabecalho } from "@/lib/texto";
import type { BomRow } from "./types";
import { lerXlsLegado } from "./xlsLegacy";

const MAX_LINHAS_PROCURA_CABECALHO = 20;

// A coluna da numeração hierárquica aparece com nomes diferentes conforme o
// modelo de BOM do CAD: "Nº", "ITEM", "Nº DO ITEM"... Casa por nome exato ou por
// conter "item"/"numero", sem nunca pegar a própria coluna da peça.
function ehColunaNumero(cabecalho: string): boolean {
  return (
    cabecalho === "n" ||
    cabecalho === "no" ||
    cabecalho.includes("item") ||
    cabecalho.includes("numero")
  );
}

// Numeração hierárquica gravada como texto no padrão brasileiro ("1,2") vira
// "1.2": é assim que o parser identifica pai e filho.
function normalizarNumero(numero: string): string {
  const limpo = numero.trim();
  return /^\d+(?:,\d+)+$/.test(limpo) ? limpo.replace(/,/g, ".") : limpo;
}

// Coluna da massa unitária da peça ("Peso", "MASSA", "PESO (g)"...). Só o nome
// varia entre modelos de BOM; a unidade nunca vem no arquivo (o usuário escolhe
// g/kg na tela).
function ehColunaPeso(cabecalho: string): boolean {
  return cabecalho.startsWith("peso") || cabecalho.startsWith("massa");
}

// Número gravado como texto no padrão brasileiro ("1.053,36" / "1053,36") ou já
// como número da planilha. Devolve null quando a célula está vazia ou ilegível.
function lerNumero(bruto: unknown): number | null {
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;
  const texto = String(bruto ?? "").trim();
  if (!texto) return null;
  // "1.053,36" -> "1053.36"; "1053.36" segue igual (só tem vírgula se for decimal).
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** Lê a planilha de BOM exportada do CAD (.xls/.xlsx) e extrai Nº / Peça / Qtd. */
export async function lerBomDeArquivo(file: File): Promise<BomRow[]> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // Caminho normal: SheetJS lê a grande maioria dos .xlsx/.xls.
  let grid: unknown[][] | null = null;
  try {
    const wb = XLSX.read(bytes, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (sheet) {
      grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    }
  } catch {
    // SheetJS abortou (ex.: .xls BIFF antigo do CAD → "Slurp error"). Tentamos o
    // leitor de fallback abaixo antes de desistir.
  }

  // Fallback: .xls binário antigo (BIFF8 em contêiner OLE) que o SheetJS recusa.
  if (!grid) {
    grid = lerXlsLegado(bytes);
  }

  if (!grid) {
    throw new Error(
      "Não consegui ler esta planilha. Confira se é um Excel (.xlsx ou .xls) válido, " +
        "não protegido por senha e não corrompido — e se é a BOM exportada do CAD.",
    );
  }

  let headerRowIdx = -1;
  let colPeca = -1;
  let colNumero = -1;
  let colQtd = -1;
  let colPeso = -1;
  let colEspec = -1;

  for (let r = 0; r < Math.min(grid.length, MAX_LINHAS_PROCURA_CABECALHO); r++) {
    const linha = (grid[r] ?? []).map((c) => normalizarCabecalho(String(c ?? "")));
    const idxPeca = linha.findIndex((c) => c.includes("peca") || c.includes("descric"));
    if (idxPeca === -1) continue;

    headerRowIdx = r;
    colPeca = idxPeca;
    colNumero = linha.findIndex((c, i) => i !== colPeca && ehColunaNumero(c));
    colQtd = linha.findIndex((c) => c.includes("qtd") || c.includes("quantidade"));
    colPeso = linha.findIndex(ehColunaPeso);
    // A especificação da matéria-prima é a OUTRA coluna de descrição (no modelo
    // do CAD a peça vem em "PEÇA" e a especificação em "DESCRIÇÃO"). Aceita
    // também "MATERIA PRIMA"/"MATERIAL", que é como o pedido descreveu a coluna.
    colEspec = linha.findIndex(
      (c, i) => i !== colPeca && (c.includes("descric") || c.includes("materia") || c.includes("material")),
    );
    break;
  }

  if (headerRowIdx === -1) {
    throw new Error(
      'Não encontrei uma coluna "PEÇA" (ou "Descrição") nesta planilha. Confira se o arquivo é a BOM exportada do CAD.',
    );
  }

  const rows: BomRow[] = [];
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const linha = grid[r] ?? [];
    const peca = String(linha[colPeca] ?? "");
    if (!peca.trim()) continue;

    const numero = colNumero >= 0 ? normalizarNumero(String(linha[colNumero] ?? "")) : "";
    const qtdBruta = colQtd >= 0 ? linha[colQtd] : "";
    const qtdNum = typeof qtdBruta === "number" ? qtdBruta : Number(qtdBruta);

    rows.push({
      linha: r + 1,
      numero,
      peca,
      quantidade: Number.isFinite(qtdNum) && qtdBruta !== "" ? qtdNum : null,
      peso: colPeso >= 0 ? lerNumero(linha[colPeso]) : null,
      especificacao: colEspec >= 0 ? String(linha[colEspec] ?? "").trim() : "",
    });
  }

  return rows;
}

import * as XLSX from "xlsx";

import { normalizarCabecalho } from "@/lib/texto";
import type { BomRow } from "./types";
import { lerXlsLegado } from "./xlsLegacy";

const MAX_LINHAS_PROCURA_CABECALHO = 20;

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

  for (let r = 0; r < Math.min(grid.length, MAX_LINHAS_PROCURA_CABECALHO); r++) {
    const linha = (grid[r] ?? []).map((c) => normalizarCabecalho(String(c ?? "")));
    const idxPeca = linha.findIndex((c) => c.includes("peca") || c.includes("descric"));
    if (idxPeca === -1) continue;

    headerRowIdx = r;
    colPeca = idxPeca;
    colNumero = linha.findIndex((c) => c === "n" || c === "no" || c === "item" || c.includes("numero"));
    colQtd = linha.findIndex((c) => c.includes("qtd") || c.includes("quantidade"));
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

    const numero = colNumero >= 0 ? String(linha[colNumero] ?? "") : "";
    const qtdBruta = colQtd >= 0 ? linha[colQtd] : "";
    const qtdNum = typeof qtdBruta === "number" ? qtdBruta : Number(qtdBruta);

    rows.push({
      linha: r + 1,
      numero,
      peca,
      quantidade: Number.isFinite(qtdNum) && qtdBruta !== "" ? qtdNum : null,
    });
  }

  return rows;
}

// Script de INSPEÇÃO (uso local, não faz parte do app): despeja a grade bruta de
// uma BOM do CAD usando o mesmo caminho de leitura da tela (SheetJS + fallback
// BIFF legado). Serve pra conferir cabeçalhos/colunas de um arquivo real.
//
//   npx tsx scripts/dump-bom.ts "caminho/da/BOM.xls"

import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

import { lerXlsLegado } from "../src/lib/bom/xlsLegacy";

const caminho = process.argv[2];
if (!caminho) {
  console.error('uso: npx tsx scripts/dump-bom.ts "caminho/da/BOM.xls"');
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(caminho));

let grid: unknown[][] | null = null;
try {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (sheet) {
    grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    console.log(`[SheetJS] abas: ${JSON.stringify(wb.SheetNames)}`);
  }
} catch (e) {
  console.log(`[SheetJS] falhou (${String(e).slice(0, 80)}) — usando o fallback BIFF`);
}

if (!grid) grid = lerXlsLegado(bytes);
if (!grid) {
  console.error("não consegui ler a planilha por nenhum dos dois caminhos");
  process.exit(1);
}

console.log(`linhas: ${grid.length}\n`);
grid.forEach((linha, i) => {
  const celulas = (linha ?? [])
    .map((c, j) => (String(c ?? "").trim() ? `${XLSX.utils.encode_col(j)}:${JSON.stringify(c)}` : null))
    .filter(Boolean);
  if (celulas.length) console.log(`L${i + 1} | ${celulas.join(" | ")}`);
});

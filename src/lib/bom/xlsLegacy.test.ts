import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseBom, parseEstrutura } from "./bomParser";
import { lerXlsLegado } from "./xlsLegacy";

// .xls binário antigo (BIFF8 em OLE) exportado pelo CAD, que o SheetJS NÃO abre
// ("Slurp error"). O leitor de fallback tem que extrair Nº / PEÇA / QTD.
const CAMINHO = fileURLToPath(new URL("./__fixtures__/bom-legado-biff.xls", import.meta.url));
const BYTES = new Uint8Array(readFileSync(CAMINHO));

function grade(): unknown[][] {
  const g = lerXlsLegado(BYTES.slice());
  if (!g) throw new Error("lerXlsLegado devolveu null para um BIFF válido");
  return g;
}

describe("xlsLegacy — leitura de .xls BIFF antigo que o SheetJS recusa", () => {
  it("extrai o cabeçalho Nº / PEÇA / QTD", () => {
    const g = grade();
    expect(g[0].map(String)).toEqual(["Nº", "PEÇA", "QTD."]);
  });

  it("extrai as linhas com numeração hierárquica e códigos da BOM", () => {
    const g = grade();
    // linha 1: item de topo "1", código CREHS SM001..., qtd 1
    expect(String(g[1][0])).toBe("1");
    expect(String(g[1][1])).toContain("CREHS SM001");
    // linha 3: filho "1.2" com quantidade 4
    expect(String(g[3][0])).toBe("1.2");
    expect(String(g[3][2])).toBe("4");
  });

  it("retorna null para bytes que não são um contêiner OLE", () => {
    expect(lerXlsLegado(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });

  it("a grade extraída alimenta o parser da BOM (produtos + estrutura reais)", () => {
    // Reaproveita a mesma detecção de cabeçalho do lerBomDeArquivo para montar
    // as BomRow e conferir que o parse reconhece produtos e relações pai/filho.
    const g = grade();
    const rows = g.slice(1).map((linha, i) => ({
      linha: i + 2,
      numero: String(linha[0] ?? "").trim(),
      peca: String(linha[1] ?? ""),
      quantidade: linha[2] === "" ? null : Number(linha[2]),
    }));
    const parsed = parseBom(rows);
    expect(parsed.novos.length).toBeGreaterThan(0);
    const estrutura = parseEstrutura(rows);
    expect(estrutura.length).toBeGreaterThan(0);
    // A relação 1.2 -> filho deve existir com quantidade 4.
    const rel = estrutura.find((e) => e.numeroFilho === "1.2");
    expect(rel?.quantidade).toBe(4);
  });
});

import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { gerarRecebimentoXlsx } from "./planilha";

describe("gerarRecebimentoXlsx", () => {
  it("gera uma linha por produto, com a semana e os checks marcados como X", () => {
    const bytes = gerarRecebimentoXlsx([
      {
        numero: "12345",
        fornecedor: "Acme Materiais",
        dataEmissao: new Date("2026-08-12T00:00:00"),
        itens: [
          { produto: "Chapa de aço 2mm", materialRecebido: true, temOC: true, ocAprovado: false, nfeLancada: false },
        ],
      },
    ]);

    const wb = XLSX.read(bytes, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    expect(linhas[0]).toEqual([
      "Semana",
      "Nº NF",
      "Fornecedor",
      "Data Emissão",
      "Produto",
      "Material recebido",
      "Tem OC",
      "OC Aprovado",
      "NF-e lançada",
    ]);
    expect(linhas[1]).toEqual(["Agosto 10-16", "12345", "Acme Materiais", "12/08/2026", "Chapa de aço 2mm", "X", "X", "", ""]);
  });
});

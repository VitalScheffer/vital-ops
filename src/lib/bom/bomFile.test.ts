import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { lerBomDeArquivo } from "./bomFile";
import { parseBom, parseEstrutura } from "./bomParser";

// Monta um .xlsx em memória com a grade informada e devolve como File (é isso
// que o `lerBomDeArquivo` recebe da tela).
function arquivoDe(grade: unknown[][]): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grade), "Sheet1");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], "BOM.xlsx");
}

// Modelo de BOM do CAD que quebra a célula da peça em várias linhas e chama a
// coluna da numeração de "Nº DO ITEM" (o modelo antigo usava só "Nº").
const BOM_COM_QUEBRA: unknown[][] = [
  ["Nº DO ITEM", "Nº DA PEÇA", "QTD"],
  [1, "MCHUH SM001\nC0PTD R00 - LONGARINA\nRODIZIO DIR. E TOT.", 1],
  [1.1, "MCHUH PC001\nCTSLD R00 - TRAVESSA H.\nLONGARINA", 2],
  [1.2, "MCHUH PC002\nCTSLD R00 - TRAVESSA V. 1\nLONGARINA", 1],
];

describe("lerBomDeArquivo: modelo de BOM com célula em várias linhas", () => {
  it('reconhece a coluna de numeração chamada "Nº DO ITEM"', async () => {
    const rows = await lerBomDeArquivo(arquivoDe(BOM_COM_QUEBRA));
    expect(rows.map((r) => r.numero)).toEqual(["1", "1.1", "1.2"]);
    expect(rows.map((r) => r.quantidade)).toEqual([1, 2, 1]);
  });

  it("as linhas lidas geram produtos e estrutura sem cair em erro de padrão", async () => {
    const rows = await lerBomDeArquivo(arquivoDe(BOM_COM_QUEBRA));
    const parsed = parseBom(rows);
    expect(parsed.erros).toEqual([]);
    expect(parsed.novos.map((i) => i.codigo)).toEqual([
      "MCHUH SM001 C0PTD",
      "MCHUH PC001 CTSLD",
      "MCHUH PC002 CTSLD",
    ]);

    const estrutura = parseEstrutura(rows);
    expect(estrutura).toHaveLength(2);
    expect(estrutura[0].codigoPai).toBe("MCHUH SM001 C0PTD");
    expect(estrutura[0].codigoFilho).toBe("MCHUH PC001 CTSLD");
    expect(estrutura[0].quantidade).toBe(2);
  });

  it('numeração gravada como texto no padrão brasileiro ("1,1") vira "1.1"', async () => {
    const grade = BOM_COM_QUEBRA.map((linha, i) =>
      i === 0 ? linha : [String(linha[0]).replace(".", ","), linha[1], linha[2]],
    );
    const rows = await lerBomDeArquivo(arquivoDe(grade));
    expect(rows.map((r) => r.numero)).toEqual(["1", "1.1", "1.2"]);
    expect(parseEstrutura(rows)).toHaveLength(2);
  });

  it("planilha sem coluna de peça dá erro explicativo", async () => {
    await expect(lerBomDeArquivo(arquivoDe([["A", "B"], [1, 2]]))).rejects.toThrow(/PEÇA/);
  });
});

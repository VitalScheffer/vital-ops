import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { multiplicarPlanilha } from "./planilha";

describe("multiplicarPlanilha", () => {
  it("muda somente QTD quando peso não foi marcado", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Nº", "PEÇA", "QTD", "PESO", "DESCRIÇÃO"],
      [1, "MCHUH PC001", 2, 84.49, "Tubo redondo"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "BOM");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const file = new File([bytes], "conjunto.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const resultado = await multiplicarPlanilha(file, { fator: 10, quantidade: true, peso: false });
    const gerado = XLSX.read(resultado.bytes, { type: "array" });
    const valores = XLSX.utils.sheet_to_json<unknown[]>(gerado.Sheets.BOM, { header: 1 });

    expect(valores[1]).toEqual([1, "MCHUH PC001", 20, 84.49, "Tubo redondo"]);
    expect(resultado.nome).toBe("conjunto-multiplicado.xlsx");
  });
});

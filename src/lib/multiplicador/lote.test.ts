import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { criarZipDeResultados } from "./lote";

describe("lote do multiplicador", () => {
  it("empacota todos os resultados em um único ZIP", () => {
    const zip = criarZipDeResultados([
      { nome: "um-multiplicado.pdf", bytes: new TextEncoder().encode("pdf"), mime: "application/pdf" },
      { nome: "dois-multiplicado.xlsx", bytes: new TextEncoder().encode("xlsx"), mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    ]);

    const arquivos = unzipSync(zip);
    expect(strFromU8(arquivos["um-multiplicado.pdf"])).toBe("pdf");
    expect(strFromU8(arquivos["dois-multiplicado.xlsx"])).toBe("xlsx");
  });
});

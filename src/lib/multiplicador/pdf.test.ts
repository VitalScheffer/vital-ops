import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { juntarPdfsMultiplicados, mapearValoresDaPagina } from "./pdf";

describe("PDF do multiplicador", () => {
  it("seleciona somente o valor da coluna QTD marcada", () => {
    const valores = mapearValoresDaPagina(
      [
        { texto: "Nº", x: 10, y: 100, largura: 10, altura: 8 },
        { texto: "PEÇA", x: 40, y: 100, largura: 24, altura: 8 },
        { texto: "QTD", x: 100, y: 100, largura: 18, altura: 8 },
        { texto: "PESO", x: 140, y: 100, largura: 24, altura: 8 },
        { texto: "1", x: 10, y: 88, largura: 5, altura: 8 },
        { texto: "MCHUH PC001", x: 40, y: 88, largura: 45, altura: 8 },
        { texto: "2", x: 105, y: 88, largura: 5, altura: 8 },
        { texto: "84,49", x: 140, y: 88, largura: 20, altura: 8 },
      ],
      { fator: 10, quantidade: true, peso: false },
    );

    expect(valores).toHaveLength(1);
    expect(valores[0]).toMatchObject({ antigo: "2", novo: "20" });
  });

  it("junta dois resultados sem descartar páginas", async () => {
    const primeiro = await PDFDocument.create();
    primeiro.addPage([100, 100]);
    const segundo = await PDFDocument.create();
    segundo.addPage([100, 100]);

    const bytes = await juntarPdfsMultiplicados([
      { nome: "a.pdf", bytes: new Uint8Array(await primeiro.save()), mime: "application/pdf" },
      { nome: "b.pdf", bytes: new Uint8Array(await segundo.save()), mime: "application/pdf" },
    ]);

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});

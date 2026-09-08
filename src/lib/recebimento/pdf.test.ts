import { describe, expect, it } from "vitest";

import { gerarRecebimentoPdf } from "./pdf";

function ehPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

describe("gerarRecebimentoPdf", () => {
  it("gera um PDF válido com notas e itens", async () => {
    const bytes = await gerarRecebimentoPdf(
      [
        {
          numero: "12345",
          fornecedor: "Acme Materiais ✓",
          dataEmissao: new Date("2026-08-12T00:00:00"),
          itens: [
            { produto: "Chapa de aço 2mm", materialRecebido: true, temOC: true, ocAprovado: false, nfeLancada: false },
          ],
        },
      ],
      "17/07/2026 15:00",
    );
    expect(ehPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("gera PDF mesmo sem nenhuma nota", async () => {
    const bytes = await gerarRecebimentoPdf([], "x");
    expect(ehPdf(bytes)).toBe(true);
  });
});

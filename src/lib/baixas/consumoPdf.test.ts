import { describe, expect, it } from "vitest";

import { resumoConsumo, type ItemConsumo } from "./consumo";
import { gerarConsumoPdf } from "./consumoPdf";

function ehPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

describe("gerarConsumoPdf", () => {
  it("gera um PDF válido com itens (inclui char fora do WinAnsi)", async () => {
    const itens: ItemConsumo[] = [
      { sku: "A", descricao: "Peça ✓ 日本", quantidade: 2, valor: 10.5, op: "OP1", finalidade: "produção" },
      { sku: "B", descricao: "Cola", quantidade: 1, valor: 50, op: null, finalidade: null },
    ];
    const bytes = await gerarConsumoPdf(resumoConsumo(itens), { de: "01/07/2026", ate: "17/07/2026" }, "17/07/2026 15:00");
    expect(ehPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("gera PDF mesmo sem consumo no período", async () => {
    const bytes = await gerarConsumoPdf(resumoConsumo([]), { de: "01/07/2026", ate: "17/07/2026" }, "x");
    expect(ehPdf(bytes)).toBe(true);
  });
});

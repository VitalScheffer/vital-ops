import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { gerarRecebimentoPdf } from "./pdf";

function ehPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

afterEach(() => vi.unstubAllGlobals());

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

  it("incorpora o TTF Sora fornecido ao cabecalho quando exportado no navegador", async () => {
    const sora = await readFile(path.join(process.cwd(), "public", "fonts", "Sora-VariableFont_wght.ttf"));
    const buscarFonte = vi.fn(async () => ({ ok: true, arrayBuffer: async () => sora.buffer.slice(sora.byteOffset, sora.byteOffset + sora.byteLength) }));
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", buscarFonte);

    const bytes = await gerarRecebimentoPdf([], "x");

    expect(ehPdf(bytes)).toBe(true);
    expect(buscarFonte).toHaveBeenCalledWith("/fonts/Sora-VariableFont_wght.ttf");
  });
});

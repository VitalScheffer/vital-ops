import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { gerarRecebimentoXlsx } from "./planilha";
import { LOGO_PLANILHA, logoVitalSchefferPlanilhaPng } from "./logoDecode";

function dimensoesPng(bytes: Uint8Array): { largura: number; altura: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { largura: view.getUint32(16), altura: view.getUint32(20) };
}

async function lerPlanilha(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bytes crus; exceljs aceita Buffer/Uint8Array em runtime.
  await wb.xlsx.load(bytes as any);
  return wb.getWorksheet("Recebimento")!;
}

describe("gerarRecebimentoXlsx", () => {
  it("gera a faixa da marca, a seção da semana, o cabeçalho da NF e os checks marcados", async () => {
    const bytes = await gerarRecebimentoXlsx(
      [
        {
          numero: "12345",
          fornecedor: "Acme Materiais",
          dataEmissao: new Date("2026-08-12T00:00:00"),
          itens: [
            { produto: "Chapa de aço 2mm", materialRecebido: true, temOC: true, ocAprovado: false, nfeLancada: false },
          ],
        },
      ],
      "17/07/2026 15:00",
    );

    const ws = await lerPlanilha(bytes);
    expect(ws.getRow(1).height).toBe(92);
    expect(ws.pageSetup.paperSize).toBe(9);
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.views[0]?.showGridLines).toBe(false);
    expect(ws.getColumn(1).width).toBe(5.3);
    expect(ws.getColumn(2).width).toBe(22);
    expect(ws.getColumn(3).width).toBe(14);
    expect(ws.getColumn(4).width).toBe(26);
    expect(ws.getColumn(9).width).toBe(5.3);
    expect(ws.getCell("A1").fill).toMatchObject({ fgColor: { argb: "FF0A5560" } });
    expect(ws.getCell("I1").fill).toMatchObject({ fgColor: { argb: "FF0A5560" } });
    expect(ws.getCell("A3").fill).toMatchObject({ fgColor: { argb: "FFEDF6F5" } });
    expect(ws.getCell("I5").fill).toMatchObject({ fgColor: { argb: "FFDEE6E8" } });
    expect(ws.getCell("E1").value).toMatchObject({
      richText: [{ text: "Recebimento de NF" }, { text: "\nGerado em 17/07/2026 15:00" }],
    });
    expect(ws.getCell("C1").value).toBe("Vital Ops");
    expect(ws.getCell("C1").font?.name).toBe("Sora");
    expect(ws.getCell("C1").alignment).toMatchObject({ vertical: "middle" });
    expect(ws.getCell("C1").alignment?.wrapText).toBeUndefined();
    expect(ws.getCell("B3").value).toBe("Agosto 10-16");
    expect(ws.getCell("B4").value).toBe("NF 12345 · Acme Materiais");
    expect(ws.getCell("G4").value).toBe("12/08/2026");
    expect(ws.getCell("B5").value).toBe("Produto");
    expect(ws.getCell("B6").value).toBe("Chapa de aço 2mm");
    expect(ws.getCell("E6").value).toBe("✓");
    expect(ws.getCell("F6").value).toBe("✓");
    expect(ws.getCell("G6").value).toBe("");
    expect(ws.getCell("H6").value).toBe("");
    expect(ws.getImages()).toHaveLength(1);
    const imagem = ws.getImages()[0];
    const range = imagem.range as unknown as { tl: { col: number; row: number }; ext: { width: number; height: number } };
    expect(range.tl.col).toBe(1);
    expect(range.tl.row).toBe(0);
    expect(range.ext).toMatchObject({ width: LOGO_PLANILHA.largura, height: LOGO_PLANILHA.altura });
    expect(dimensoesPng(logoVitalSchefferPlanilhaPng())).toEqual({
      largura: LOGO_PLANILHA.largura,
      altura: LOGO_PLANILHA.altura,
    });
  });

  it("gera planilha válida mesmo sem nenhuma nota", async () => {
    const bytes = await gerarRecebimentoXlsx([], "x");
    const ws = await lerPlanilha(bytes);
    expect(ws.getCell("B3").value).toBe("Nenhuma nota registrada.");
  });
});

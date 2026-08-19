import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { escalaDoResgate, juntarPdfs, motivoDaFalha, type PaginaRaster } from "./pdf";

// PNG 1x1 branco: o que o rasterizador de mentira devolve no lugar da folha.
const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

async function pdfComPaginas(qtd: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < qtd; i++) doc.addPage([842, 595]);
  return new Uint8Array(await doc.save());
}

// Bytes que não são PDF nenhum: é o que faz o pdf-lib recusar, do mesmo jeito
// que ele recusa a prancha que o CAD exportou fora do padrão.
const LIXO = new TextEncoder().encode("isto nao e um pdf");

const rasterOk = async (): Promise<PaginaRaster[]> => [
  { png: PNG_1X1, larguraPt: 842, alturaPt: 595 },
];

describe("juntarPdfs", () => {
  it("junta as partes legíveis contando todas as páginas", async () => {
    const r = await juntarPdfs([
      { nome: "capa.pdf", bytes: await pdfComPaginas(1) },
      { nome: "prancha.pdf", bytes: await pdfComPaginas(2) },
    ]);
    expect(r.paginas).toBe(3);
    expect(r.falhas).toEqual([]);
    expect(r.resgatados).toEqual([]);
  });

  it("resgata como imagem a prancha que o pdf-lib recusa, sem perder a folha", async () => {
    const r = await juntarPdfs(
      [
        { nome: "boa.pdf", bytes: await pdfComPaginas(1) },
        { nome: "CPPMC SM01 R01 - CONJUNTO DO BRACO.pdf", bytes: LIXO },
        { nome: "outra.pdf", bytes: await pdfComPaginas(1) },
      ],
      rasterOk,
    );
    expect(r.paginas).toBe(3); // era 2 antes do resgate
    expect(r.resgatados).toEqual(["CPPMC SM01 R01 - CONJUNTO DO BRACO.pdf"]);
    expect(r.falhas).toEqual([]);
  });

  it("o resgate mantém a folha no tamanho original da prancha", async () => {
    const r = await juntarPdfs([{ nome: "a1.pdf", bytes: LIXO }], async () => [
      { png: PNG_1X1, larguraPt: 2384, alturaPt: 1684 },
    ]);
    const doc = await PDFDocument.load(r.bytes);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(2384);
    expect(Math.round(height)).toBe(1684);
  });

  it("só vira falha quando os dois leitores desistem, e diz o porquê", async () => {
    const r = await juntarPdfs([{ nome: "quebrada.pdf", bytes: LIXO }], async () => {
      throw new Error("pdfjs tambem nao abriu");
    });
    expect(r.paginas).toBe(0);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].nome).toBe("quebrada.pdf");
    expect(r.falhas[0].motivo).toMatch(/resgate também falhou/);
    expect(r.falhas[0].motivo).toMatch(/pdfjs tambem nao abriu/);
  });

  it("resgate que quebra no meio não deixa meia prancha no PDF", async () => {
    // Prancha de 2 folhas cuja 2ª imagem o pdf-lib recusa: a 1ª já embutida
    // ficaria no arquivo final e mesmo assim seria anunciada como falha.
    const r = await juntarPdfs(
      [
        { nome: "boa.pdf", bytes: await pdfComPaginas(1) },
        { nome: "meia.pdf", bytes: LIXO },
      ],
      async () => [
        { png: PNG_1X1, larguraPt: 842, alturaPt: 595 },
        { png: new TextEncoder().encode("isto nao e um png"), larguraPt: 842, alturaPt: 595 },
      ],
    );
    expect(r.paginas).toBe(1);
    expect(r.resgatados).toEqual([]);
    expect(r.falhas).toHaveLength(1);
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("PDF sem página nenhuma não conta como resgatado", async () => {
    const r = await juntarPdfs([{ nome: "vazia.pdf", bytes: LIXO }], async () => []);
    expect(r.resgatados).toEqual([]);
    expect(r.falhas).toHaveLength(1);
  });
});

describe("escalaDoResgate", () => {
  it("usa o DPI alvo quando a folha cabe no teto de pixels", () => {
    expect(escalaDoResgate(595, 842, 200)).toBeCloseTo(200 / 72, 5);
  });

  it("reduz a escala na folha grande para não estourar a memória do navegador", () => {
    const escala = escalaDoResgate(3370, 2384, 200, 24_000_000); // A0
    expect(escala).toBeLessThan(200 / 72);
    expect(3370 * escala * 2384 * escala).toBeLessThanOrEqual(24_000_001);
  });

  it("nunca desce abaixo de 1:1", () => {
    expect(escalaDoResgate(20000, 20000, 200, 1000)).toBe(1);
  });
});

describe("motivoDaFalha", () => {
  it("traduz o PDF protegido", () => {
    expect(motivoDaFalha(new Error("Input document to `PDFDocument.load` is encrypted"))).toMatch(
      /protegido/,
    );
  });

  it("mantém a mensagem crua quando o erro é novo", () => {
    expect(motivoDaFalha(new Error("Expected instance of PDFDict"))).toBe(
      "Expected instance of PDFDict",
    );
  });
});

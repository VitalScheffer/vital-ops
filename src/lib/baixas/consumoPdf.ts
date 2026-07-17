// PDF do relatório de consumo das baixas — CLIENT-ONLY (pdf-lib no navegador).
// Marca Vital Scheffer no cabeçalho, total do período em R$ e três tabelas:
// por produto, por OP e por finalidade. A lógica (agrupar/totais) vem de
// consumo.ts.

import { formatarReais, type GrupoConsumo, type ResumoConsumo } from "./consumo";

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 40;
const DIR = A4.largura - MARGEM;
const BANDA = 92;
const RODAPE = 34;

function paraWinAnsi(texto: string): string {
  return Array.from(texto)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 32 && code <= 255 ? ch : "?";
    })
    .join("");
}

export async function gerarConsumoPdf(
  resumo: ResumoConsumo,
  periodo: { de: string; ate: string },
  geradoEm: string,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, LineCapStyle } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const fonteBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const COR = {
    petroleo: rgb(0.039, 0.333, 0.376),
    turquesa: rgb(0.075, 0.714, 0.659),
    agua: rgb(0.373, 0.816, 0.769),
    tinta: rgb(0.075, 0.149, 0.169),
    branco: rgb(1, 1, 1),
    aguaClara: rgb(0.83, 0.95, 0.93),
    cinza: rgb(0.42, 0.45, 0.47),
    faixaSecao: rgb(0.93, 0.965, 0.96),
    regua: rgb(0.87, 0.9, 0.91),
  };

  let pagina = doc.addPage([A4.largura, A4.altura]);
  let y = A4.altura;

  const larguraDe = (t: string, size: number, bold: boolean) =>
    (bold ? fonteBold : fonte).widthOfTextAtSize(t, size);

  const encurtar = (t: string, size: number, larguraMax: number, bold = false): string => {
    if (larguraDe(t, size, bold) <= larguraMax) return t;
    let corte = t;
    while (corte.length > 1 && larguraDe(`${corte}...`, size, bold) > larguraMax) corte = corte.slice(0, -1);
    return `${corte}...`;
  };

  const escrever = (
    bruto: string,
    x: number,
    baseline: number,
    o: { size?: number; bold?: boolean; cor?: ReturnType<typeof rgb>; alinhar?: "dir"; larguraMax?: number } = {},
  ) => {
    const size = o.size ?? 9;
    const bold = o.bold ?? false;
    let t = paraWinAnsi(bruto);
    if (o.larguraMax) t = encurtar(t, size, o.larguraMax, bold);
    const px = o.alinhar === "dir" ? x - larguraDe(t, size, bold) : x;
    pagina.drawText(t, { x: px, y: baseline, size, font: bold ? fonteBold : fonte, color: o.cor ?? COR.tinta });
  };

  const desenharLogo = (x: number, yTopo: number, altura: number) => {
    try {
      const escala = altura / 32;
      const opt = {
        x,
        y: yTopo,
        scale: escala,
        borderColor: COR.turquesa,
        borderWidth: 3.2 * escala,
        borderLineCap: LineCapStyle.Round,
      };
      pagina.drawSvgPath("M 15 25 C 15 18.8 13.2 15.8 10.8 13.6 C 9.2 12.1 8 11.3 7 10.8", opt);
      pagina.drawSvgPath("M 15 25 C 15 18.8 16.8 15.8 19.2 13.6 C 20.8 12.1 22 11.3 23 10.8", opt);
      pagina.drawCircle({ x: x + 15 * escala, y: yTopo - 6.2 * escala, size: 3.2 * escala, color: COR.agua });
    } catch {
      // sem logo, segue
    }
  };

  const desenharCabecalho = () => {
    pagina.drawRectangle({ x: 0, y: A4.altura - BANDA, width: A4.largura, height: BANDA, color: COR.petroleo });
    desenharLogo(MARGEM, A4.altura - (BANDA - 40) / 2, 40);
    const textoX = MARGEM + 40 * 0.75 + 10;
    escrever("Vital Scheffer", textoX, A4.altura - 34, { size: 18, bold: true, cor: COR.branco });
    escrever("Vital Ops", textoX, A4.altura - 48, { size: 9.5, cor: COR.agua });
    escrever("Relatório de Consumo", DIR, A4.altura - 32, { size: 13, bold: true, cor: COR.branco, alinhar: "dir" });
    escrever(`Período: ${periodo.de} a ${periodo.ate}`, DIR, A4.altura - 47, {
      size: 8.5,
      cor: COR.aguaClara,
      alinhar: "dir",
    });
    escrever(`Gerado em ${geradoEm}`, DIR, A4.altura - 59, { size: 8.5, cor: COR.aguaClara, alinhar: "dir" });
    y = A4.altura - BANDA - 20;
  };

  const novaPagina = () => {
    pagina = doc.addPage([A4.largura, A4.altura]);
    pagina.drawRectangle({ x: 0, y: A4.altura - 40, width: A4.largura, height: 40, color: COR.petroleo });
    desenharLogo(MARGEM, A4.altura - 7, 26);
    escrever("Vital Scheffer · Vital Ops · Relatório de Consumo", MARGEM + 30, A4.altura - 24, {
      size: 9,
      bold: true,
      cor: COR.branco,
    });
    y = A4.altura - 40 - 16;
  };

  const assegurar = (altura: number) => {
    if (y - altura < MARGEM + RODAPE) novaPagina();
  };

  desenharCabecalho();

  // Total do período (faixa clara).
  pagina.drawRectangle({
    x: MARGEM,
    y: y - 26,
    width: DIR - MARGEM,
    height: 26,
    color: COR.faixaSecao,
    borderColor: COR.regua,
    borderWidth: 0.5,
  });
  escrever("Consumo total no período", MARGEM + 12, y - 16, { size: 10, cor: COR.cinza });
  escrever(formatarReais(resumo.totalValor), DIR - 12, y - 15, {
    size: 15,
    bold: true,
    cor: COR.petroleo,
    alinhar: "dir",
  });
  y -= 26 + 18;

  if (resumo.totalItens === 0) {
    escrever("Nenhuma baixa (não estornada) no período.", MARGEM, y, { size: 10, cor: COR.cinza });
  }

  // Tabela genérica de um agrupamento (rótulo | qtd | R$).
  const secao = (titulo: string, rotulo: string, grupos: GrupoConsumo[]) => {
    if (grupos.length === 0) return;
    assegurar(20 + 16 + 15);
    pagina.drawRectangle({ x: MARGEM, y: y - 20, width: DIR - MARGEM, height: 20, color: COR.faixaSecao });
    escrever(titulo, MARGEM + 10, y - 14, { size: 11, bold: true, cor: COR.tinta });
    y -= 20 + 8;

    escrever(rotulo.toUpperCase(), MARGEM, y, { size: 7.5, bold: true, cor: COR.cinza });
    escrever("QTD", 400, y, { size: 7.5, bold: true, cor: COR.cinza, alinhar: "dir" });
    escrever("VALOR (R$)", DIR, y, { size: 7.5, bold: true, cor: COR.cinza, alinhar: "dir" });
    y -= 4;
    pagina.drawLine({ start: { x: MARGEM, y }, end: { x: DIR, y }, thickness: 0.7, color: COR.regua });
    y -= 12;

    for (const grupo of grupos) {
      assegurar(13);
      escrever(grupo.chave, MARGEM, y, { size: 8.5, cor: COR.tinta, larguraMax: 300 });
      escrever(grupo.quantidade.toLocaleString("pt-BR"), 400, y, { size: 8.5, cor: COR.tinta, alinhar: "dir" });
      escrever(formatarReais(grupo.valor), DIR, y, { size: 8.5, cor: COR.tinta, alinhar: "dir" });
      y -= 12;
      pagina.drawLine({ start: { x: MARGEM, y: y + 3 }, end: { x: DIR, y: y + 3 }, thickness: 0.4, color: COR.regua });
    }
    y -= 14;
  };

  secao("Por produto", "Produto", resumo.porProduto);
  secao("Por OP", "OP", resumo.porOp);
  secao("Por finalidade", "Finalidade", resumo.porFinalidade);

  // Rodapé com paginação.
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGEM, y: RODAPE - 6 },
      end: { x: DIR, y: RODAPE - 6 },
      thickness: 0.5,
      color: COR.regua,
    });
    p.drawText("Vital Scheffer · Vital Ops", { x: MARGEM, y: RODAPE - 18, size: 7.5, font: fonte, color: COR.cinza });
    const rot = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(rot, {
      x: DIR - fonte.widthOfTextAtSize(rot, 7.5),
      y: RODAPE - 18,
      size: 7.5,
      font: fonte,
      color: COR.cinza,
    });
  });

  return doc.save();
}

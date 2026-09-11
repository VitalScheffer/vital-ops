// PDF do checklist de Recebimento de NF — CLIENT-ONLY (pdf-lib no navegador),
// mesmo visual do resto do app (ver baixas/consumoPdf.ts). Uma seção por
// semana, uma tabela por NF, um quadradinho (preenchido = marcado) por evento.

import { LOGO_HEADER, logoVitalSchefferHeaderPng } from "./logoDecode";
import { agruparPorSemana } from "./semanas";
import type { NotaRecebimentoExport } from "./planilha";

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 40;
const DIR = A4.largura - MARGEM;
const BANDA = 74;
const RODAPE = 34;
const EVENTOS = [
  { chave: "materialRecebido" as const, rotulo: "Material" },
  { chave: "temOC" as const, rotulo: "Tem OC" },
  { chave: "ocAprovado" as const, rotulo: "OC Aprov." },
  { chave: "nfeLancada" as const, rotulo: "NF-e" },
];
const LARGURA_EVENTO = 46;

function paraWinAnsi(texto: string): string {
  return Array.from(texto)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 32 && code <= 255 ? ch : "?";
    })
    .join("");
}

function dataBr(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(data);
}

async function carregarFonteSora(): Promise<Uint8Array | null> {
  if (typeof window === "undefined") return null;

  try {
    const resposta = await fetch("/fonts/Sora-VariableFont_wght.ttf");
    if (!resposta.ok) return null;

    return new Uint8Array(await resposta.arrayBuffer());
  } catch {
    return null;
  }
}

export async function gerarRecebimentoPdf(notas: readonly NotaRecebimentoExport[], geradoEm: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, LineCapStyle } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const fonteBold = await doc.embedFont(StandardFonts.HelveticaBold);
  let fonteCabecalho = fonte;
  let fonteCabecalhoBold = fonteBold;
  const fonteSora = await carregarFonteSora();
  if (fonteSora) {
    const { default: fontkit } = await import("@pdf-lib/fontkit");
    doc.registerFontkit(fontkit);
    const sora = await doc.embedFont(fonteSora);
    fonteCabecalho = sora;
    fonteCabecalhoBold = sora;
  }

  // Lockup oficial completo da referência, convertido para branco. Vital Ops
  // permanece texto para preservar a tipografia Sora no subtítulo.
  const logo = await doc.embedPng(logoVitalSchefferHeaderPng());
  const logoRazao = LOGO_HEADER.largura / LOGO_HEADER.altura;

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

  const larguraDe = (t: string, size: number, bold: boolean) => (bold ? fonteBold : fonte).widthOfTextAtSize(t, size);

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
    o: {
      size?: number;
      bold?: boolean;
      cor?: ReturnType<typeof rgb>;
      alinhar?: "dir" | "centro";
      larguraMax?: number;
      fonte?: typeof fonte;
    } = {},
  ) => {
    const size = o.size ?? 9;
    const bold = o.bold ?? false;
    let t = paraWinAnsi(bruto);
    if (o.larguraMax) t = encurtar(t, size, o.larguraMax, bold);
    const fonteUsada = o.fonte ?? (bold ? fonteBold : fonte);
    const largura = fonteUsada.widthOfTextAtSize(t, size);
    const px = o.alinhar === "dir" ? x - largura : o.alinhar === "centro" ? x - largura / 2 : x;
    pagina.drawText(t, { x: px, y: baseline, size, font: fonteUsada, color: o.cor ?? COR.tinta });
  };

  const desenharCabecalho = () => {
    pagina.drawRectangle({ x: 0, y: A4.altura - BANDA, width: A4.largura, height: BANDA, color: COR.petroleo });
    const logoAltura = 40;
    const logoLargura = logoAltura * logoRazao;
    const logoX = 22;
    const logoY = A4.altura - BANDA + (BANDA - logoAltura) / 2;
    pagina.drawImage(logo, { x: logoX, y: logoY, width: logoLargura, height: logoAltura });
    // A base da assinatura acompanha a base do wordmark, não a borda inferior
    // transparente do PNG.
    escrever(
      "Vital Ops",
      logoX + logoLargura + 8,
      logoY + logoAltura * ((LOGO_HEADER.altura - LOGO_HEADER.baseWordmarkY) / LOGO_HEADER.altura),
      {
        size: 9.5,
        bold: true,
        cor: COR.agua,
        fonte: fonteCabecalhoBold,
      },
    );
    escrever("Recebimento de NF", A4.largura - 24, A4.altura - 38, {
      size: 16,
      bold: true,
      cor: COR.branco,
      alinhar: "dir",
      fonte: fonteCabecalhoBold,
    });
    escrever(`Gerado em ${geradoEm}`, A4.largura - 24, A4.altura - 55, {
      size: 9.5,
      cor: COR.aguaClara,
      alinhar: "dir",
      fonte: fonteCabecalho,
    });
    y = A4.altura - BANDA - 20;
  };

  const novaPagina = () => {
    pagina = doc.addPage([A4.largura, A4.altura]);
    pagina.drawRectangle({ x: 0, y: A4.altura - 40, width: A4.largura, height: 40, color: COR.petroleo });
    const logoAltura = 28;
    const logoLargura = logoAltura * logoRazao;
    const logoY = A4.altura - 40 + (40 - logoAltura) / 2;
    pagina.drawImage(logo, { x: MARGEM, y: logoY, width: logoLargura, height: logoAltura });
    escrever("Recebimento de NF", MARGEM + logoLargura + 14, A4.altura - 24, {
      size: 9,
      bold: true,
      cor: COR.branco,
      fonte: fonteCabecalhoBold,
    });
    y = A4.altura - 40 - 16;
  };

  const assegurar = (altura: number) => {
    if (y - altura < MARGEM + RODAPE) novaPagina();
  };

  // Quadradinho do checklist: contorno sempre visível (sinal vazio); marcado
  // ganha um check por dentro, em vez de preencher o quadrado inteiro.
  const quadradinho = (x: number, baseline: number, marcado: boolean) => {
    const lado = 9;
    const yBase = baseline - 1;
    pagina.drawRectangle({
      x: x - lado / 2,
      y: yBase,
      width: lado,
      height: lado,
      color: COR.branco,
      borderColor: COR.regua,
      borderWidth: 0.8,
    });
    if (marcado) {
      const opt = { thickness: 1.2, color: COR.turquesa, lineCap: LineCapStyle.Round };
      pagina.drawLine({ start: { x: x - 2.7, y: yBase + 4.3 }, end: { x: x - 0.6, y: yBase + 2 }, ...opt });
      pagina.drawLine({ start: { x: x - 0.6, y: yBase + 2 }, end: { x: x + 3, y: yBase + 7.2 }, ...opt });
    }
  };

  desenharCabecalho();

  if (notas.length === 0) {
    escrever("Nenhuma nota registrada.", MARGEM, y, { size: 10, cor: COR.cinza });
  }

  const grupos = agruparPorSemana(notas, (nota) => nota.dataEmissao);
  for (const grupo of grupos) {
    assegurar(20 + 12);
    pagina.drawRectangle({ x: MARGEM, y: y - 20, width: DIR - MARGEM, height: 20, color: COR.faixaSecao });
    escrever(grupo.rotulo, MARGEM + 10, y - 14, { size: 11, bold: true, cor: COR.tinta });
    y -= 20 + 10;

    for (const nota of grupo.itens) {
      assegurar(14 + 16);
      escrever(`NF ${nota.numero} · ${nota.fornecedor}`, MARGEM, y, { size: 9.5, bold: true, cor: COR.petroleo, larguraMax: 320 });
      escrever(dataBr(nota.dataEmissao), DIR, y, { size: 8.5, cor: COR.cinza, alinhar: "dir" });
      y -= 14;

      const xProduto = MARGEM;
      const larguraProduto = DIR - MARGEM - EVENTOS.length * LARGURA_EVENTO;
      escrever("PRODUTO", xProduto, y, { size: 7, bold: true, cor: COR.cinza });
      EVENTOS.forEach((evento, i) => {
        const x = xProduto + larguraProduto + i * LARGURA_EVENTO + LARGURA_EVENTO / 2;
        escrever(evento.rotulo, x, y, { size: 6.5, bold: true, cor: COR.cinza, alinhar: "centro" });
      });
      y -= 4;
      pagina.drawLine({ start: { x: MARGEM, y }, end: { x: DIR, y }, thickness: 0.6, color: COR.regua });
      y -= 11;

      for (const item of nota.itens) {
        assegurar(12);
        escrever(item.produto, xProduto, y, { size: 8.5, cor: COR.tinta, larguraMax: larguraProduto - 6 });
        EVENTOS.forEach((evento, i) => {
          const x = xProduto + larguraProduto + i * LARGURA_EVENTO + LARGURA_EVENTO / 2;
          quadradinho(x, y - 1, item[evento.chave]);
        });
        y -= 12;
        pagina.drawLine({ start: { x: MARGEM, y: y + 3 }, end: { x: DIR, y: y + 3 }, thickness: 0.3, color: COR.regua });
      }
      y -= 12;
    }
  }

  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: MARGEM, y: RODAPE - 6 }, end: { x: DIR, y: RODAPE - 6 }, thickness: 0.5, color: COR.regua });
    p.drawText("Vital Scheffer · Vital Ops", { x: MARGEM, y: RODAPE - 18, size: 7.5, font: fonte, color: COR.cinza });
    const rot = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(rot, { x: DIR - fonte.widthOfTextAtSize(rot, 7.5), y: RODAPE - 18, size: 7.5, font: fonte, color: COR.cinza });
  });

  return doc.save();
}

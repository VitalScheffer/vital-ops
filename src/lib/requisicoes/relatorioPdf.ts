// Gerador do PDF do relatório de requisições — CLIENT-ONLY (pdf-lib no
// navegador, nada sobe pro servidor). Layout com a marca Vital Scheffer:
// faixa de cabeçalho com a logo, resumo do período, um bloco por requisição
// com a tabela de itens, e rodapé com paginação. A lógica pura (rótulos,
// totais) vem de relatorio.ts.

import { formatarNumeroRequisicao } from "@/lib/contracts";
import {
  quantidadeComUnidade,
  statusItemLabel,
  statusRequisicaoLabel,
  resumoRelatorio,
  type RequisicaoRelatorio,
} from "./relatorio";

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 40;
const DIR = A4.largura - MARGEM; // borda direita útil
const BANDA_1 = 92; // altura da faixa da 1ª página
const BANDA_N = 46; // altura da faixa das páginas seguintes
const RODAPE = 34;

// Colunas da tabela de itens (x da esquerda de cada coluna; qtd é alinhada à direita).
const COL = {
  sku: MARGEM, // 40
  desc: 138,
  descW: 250,
  qtdDir: 452, // alinha a quantidade à direita aqui
  sit: 462,
};

// A fonte padrão (Helvetica) só codifica WinAnsi/Latin-1 — pt-BR passa; troca o
// que não couber para não derrubar o encode.
function paraWinAnsi(texto: string): string {
  return Array.from(texto)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 32 && code <= 255 ? ch : "?";
    })
    .join("");
}

export async function gerarRelatorioPdf(
  requisicoes: readonly RequisicaoRelatorio[],
  periodo: { de: string; ate: string }, // já formatado dd/mm/aaaa
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
    verde: rgb(0.06, 0.55, 0.44),
    vermelho: rgb(0.77, 0.27, 0.25),
    ambar: rgb(0.74, 0.5, 0.11),
  };

  const corStatusReq = (req: RequisicaoRelatorio) =>
    req.cancelada
      ? COR.cinza
      : req.status === "CONFIRMADA"
        ? COR.verde
        : req.status === "RECUSADA"
          ? COR.vermelho
          : COR.ambar;

  // Rótulo do cabeçalho: excluída ganha destaque, mantendo a decisão anterior
  // entre parênteses (ex.: "EXCLUÍDA (APROVADA)").
  const rotuloStatusReq = (req: RequisicaoRelatorio) => {
    const decisao = statusRequisicaoLabel(req.status).toUpperCase();
    if (!req.cancelada) return decisao;
    return req.status === "PENDENTE" ? "EXCLUÍDA" : `EXCLUÍDA (${decisao})`;
  };
  const corStatusItem = (status: string) =>
    status === "BAIXADO" ? COR.verde : status === "FALHA" ? COR.vermelho : COR.cinza;

  let pagina = doc.addPage([A4.largura, A4.altura]);
  let y = A4.altura;

  const larguraDe = (t: string, size: number, bold: boolean) =>
    (bold ? fonteBold : fonte).widthOfTextAtSize(t, size);

  // Encurta um texto com "..." pra caber numa largura.
  const encurtar = (t: string, size: number, larguraMax: number, bold = false): string => {
    if (larguraDe(t, size, bold) <= larguraMax) return t;
    let corte = t;
    while (corte.length > 1 && larguraDe(`${corte}...`, size, bold) > larguraMax) {
      corte = corte.slice(0, -1);
    }
    return `${corte}...`;
  };

  interface OpcoesTexto {
    size?: number;
    bold?: boolean;
    cor?: ReturnType<typeof rgb>;
    alinhar?: "esq" | "dir";
    larguraMax?: number;
  }
  const escrever = (bruto: string, x: number, baseline: number, opcoes: OpcoesTexto = {}) => {
    const size = opcoes.size ?? 9;
    const bold = opcoes.bold ?? false;
    let t = paraWinAnsi(bruto);
    if (opcoes.larguraMax) t = encurtar(t, size, opcoes.larguraMax, bold);
    const largura = larguraDe(t, size, bold);
    const px = opcoes.alinhar === "dir" ? x - largura : x;
    pagina.drawText(t, {
      x: px,
      y: baseline,
      size,
      font: bold ? fonteBold : fonte,
      color: opcoes.cor ?? COR.tinta,
    });
  };

  // Logo da Vital (mesmos traços do VitalLogo.tsx). Em try/catch: se o desenho
  // de path falhar em alguma versão do pdf-lib, o relatório sai sem a logo em
  // vez de quebrar.
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
      // sem logo, segue o baile
    }
  };

  const desenharCabecalho = (primeira: boolean) => {
    const h = primeira ? BANDA_1 : BANDA_N;
    pagina.drawRectangle({ x: 0, y: A4.altura - h, width: A4.largura, height: h, color: COR.petroleo });
    const logoAltura = primeira ? 40 : 26;
    const logoTopo = A4.altura - (h - logoAltura) / 2;
    desenharLogo(MARGEM, logoTopo, logoAltura);
    const textoX = MARGEM + logoAltura * 0.75 + 10;

    if (primeira) {
      escrever("Vital Scheffer", textoX, A4.altura - 34, { size: 18, bold: true, cor: COR.branco });
      escrever("Vital Ops", textoX, A4.altura - 48, { size: 9.5, cor: COR.agua });
      // Bloco à direita: título + período + geração.
      escrever("Relatório de Requisições", DIR, A4.altura - 32, {
        size: 13,
        bold: true,
        cor: COR.branco,
        alinhar: "dir",
      });
      escrever(`Período: ${periodo.de} a ${periodo.ate}`, DIR, A4.altura - 47, {
        size: 8.5,
        cor: COR.aguaClara,
        alinhar: "dir",
      });
      escrever(`Gerado em ${geradoEm}`, DIR, A4.altura - 59, {
        size: 8.5,
        cor: COR.aguaClara,
        alinhar: "dir",
      });
      y = A4.altura - h - 20;
    } else {
      escrever("Vital Scheffer", textoX, A4.altura - 20, { size: 11, bold: true, cor: COR.branco });
      escrever("Vital Ops · Relatório de Requisições", textoX, A4.altura - 32, { size: 8, cor: COR.agua });
      escrever(`Período: ${periodo.de} a ${periodo.ate}`, DIR, A4.altura - 26, {
        size: 8,
        cor: COR.aguaClara,
        alinhar: "dir",
      });
      y = A4.altura - h - 16;
    }
  };

  const novaPagina = () => {
    pagina = doc.addPage([A4.largura, A4.altura]);
    desenharCabecalho(false);
  };

  // Garante espaço vertical; se não couber, abre página nova (com cabeçalho).
  const assegurar = (altura: number) => {
    if (y - altura < MARGEM + RODAPE) novaPagina();
  };

  desenharCabecalho(true);

  // --- Resumo do período (faixa clara com os totais) ---------------------------
  const resumo = resumoRelatorio(requisicoes);
  pagina.drawRectangle({
    x: MARGEM,
    y: y - 24,
    width: DIR - MARGEM,
    height: 24,
    color: COR.faixaSecao,
    borderColor: COR.regua,
    borderWidth: 0.5,
  });
  const chip = (rotulo: string, valor: number, x: number, cor: ReturnType<typeof rgb>) => {
    escrever(String(valor), x, y - 16, { size: 12, bold: true, cor });
    escrever(rotulo, x + larguraDe(String(valor), 12, true) + 5, y - 15.5, { size: 8.5, cor: COR.cinza });
  };
  chip("pedidos", resumo.total, MARGEM + 12, COR.tinta);
  chip("aprovados", resumo.aprovadas, MARGEM + 110, COR.verde);
  chip("recusados", resumo.recusadas, MARGEM + 218, COR.vermelho);
  chip("excluídos", resumo.excluidas, MARGEM + 326, COR.cinza);
  chip("aguardando", resumo.pendentes, MARGEM + 428, COR.ambar);
  y -= 24 + 16;

  if (requisicoes.length === 0) {
    escrever("Nenhuma requisição no período.", MARGEM, y, { size: 10, cor: COR.cinza });
  }

  // --- Um bloco por requisição -------------------------------------------------
  for (const req of requisicoes) {
    // Cabeçalho da requisição (nunca deixa o cabeçalho sozinho no fim da página).
    assegurar(22 + 14 + 16 + 15);

    pagina.drawRectangle({ x: MARGEM, y: y - 20, width: DIR - MARGEM, height: 20, color: COR.faixaSecao });
    pagina.drawRectangle({ x: MARGEM, y: y - 20, width: 3, height: 20, color: corStatusReq(req) });
    escrever(formatarNumeroRequisicao(req.numero), MARGEM + 10, y - 14, { size: 11, bold: true, cor: COR.tinta });
    escrever(rotuloStatusReq(req), DIR - 8, y - 14, {
      size: 9,
      bold: true,
      cor: corStatusReq(req),
      alinhar: "dir",
    });
    y -= 20 + 6;

    // Meta: solicitante / setor / data e a linha de decisão.
    escrever(
      `Solicitante: ${req.solicitanteNome}   ·   Setor: ${req.setor}   ·   Pedido em ${req.criadoEm}`,
      MARGEM + 2,
      y,
      { size: 8.5, cor: COR.cinza, larguraMax: DIR - MARGEM - 4 },
    );
    y -= 12;

    // Linha da decisão do gestor (uma requisição excluída pode ter sido decidida
    // antes: as duas linhas saem, na ordem em que aconteceram).
    if (req.status !== "PENDENTE") {
      const partes: string[] = [
        `${req.status === "CONFIRMADA" ? "Aprovada" : "Recusada"}${req.gestor ? ` por ${req.gestor}` : ""}`,
      ];
      if (req.decididaEm) partes.push(`em ${req.decididaEm}`);
      if (req.status === "CONFIRMADA" && req.localEstoqueNome) partes.push(`· baixa no local ${req.localEstoqueNome}`);
      if (req.motivoDecisao) partes.push(`· motivo: ${req.motivoDecisao}`);
      escrever(partes.join(" "), MARGEM + 2, y, { size: 8.5, cor: COR.cinza, larguraMax: DIR - MARGEM - 4 });
      y -= 12;
    }
    if (req.cancelada) {
      const partes: string[] = [`Excluída${req.canceladaPor ? ` por ${req.canceladaPor}` : ""}`];
      if (req.canceladaEm) partes.push(`em ${req.canceladaEm}`);
      if (req.motivoCancelamento) partes.push(`· motivo: ${req.motivoCancelamento}`);
      escrever(partes.join(" "), MARGEM + 2, y, { size: 8.5, cor: COR.vermelho, larguraMax: DIR - MARGEM - 4 });
      y -= 12;
    }
    y -= 3;

    // Cabeçalho da tabela de itens.
    assegurar(14 + 14);
    escrever("CÓDIGO", COL.sku, y, { size: 7.5, bold: true, cor: COR.cinza });
    escrever("DESCRIÇÃO", COL.desc, y, { size: 7.5, bold: true, cor: COR.cinza });
    escrever("QTD / UN.", COL.qtdDir, y, { size: 7.5, bold: true, cor: COR.cinza, alinhar: "dir" });
    escrever("SITUAÇÃO", COL.sit, y, { size: 7.5, bold: true, cor: COR.cinza });
    y -= 4;
    pagina.drawLine({ start: { x: MARGEM, y }, end: { x: DIR, y }, thickness: 0.7, color: COR.regua });
    y -= 11;

    for (const item of req.itens) {
      assegurar(13 + 10);
      escrever(item.sku, COL.sku, y, { size: 8.5, cor: COR.tinta, larguraMax: COL.desc - COL.sku - 6 });
      escrever(item.descricao, COL.desc, y, { size: 8.5, cor: COR.tinta, larguraMax: COL.descW });
      escrever(quantidadeComUnidade(item.quantidade, item.unidade), COL.qtdDir, y, {
        size: 8.5,
        cor: COR.tinta,
        alinhar: "dir",
      });
      escrever(statusItemLabel(item.status), COL.sit, y, {
        size: 8.5,
        bold: item.status !== "PENDENTE",
        cor: corStatusItem(item.status),
        larguraMax: DIR - COL.sit,
      });
      y -= 12;
      if (item.status === "FALHA" && item.motivoErro) {
        assegurar(11 + 6);
        escrever(`» ${item.motivoErro}`, COL.desc, y, {
          size: 7.5,
          cor: COR.vermelho,
          larguraMax: DIR - COL.desc,
        });
        y -= 11;
      }
      pagina.drawLine({ start: { x: MARGEM, y: y + 3 }, end: { x: DIR, y: y + 3 }, thickness: 0.4, color: COR.regua });
    }

    y -= 14;
  }

  // --- Rodapé (paginação) — desenhado no fim, quando já sabemos o total --------
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGEM, y: RODAPE - 6 },
      end: { x: DIR, y: RODAPE - 6 },
      thickness: 0.5,
      color: COR.regua,
    });
    p.drawText("Vital Scheffer · Vital Ops", {
      x: MARGEM,
      y: RODAPE - 18,
      size: 7.5,
      font: fonte,
      color: COR.cinza,
    });
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

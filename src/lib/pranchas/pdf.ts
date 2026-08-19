// Utilitários de PDF do compilador de pranchas. Rodam SÓ no navegador: pdfjs
// (leitura do texto do BOM e resgate de PDF que o pdf-lib recusa) e pdf-lib
// (junção das pranchas num PDF único). São importados dinamicamente para não
// entrarem no bundle das outras telas nem tentarem rodar no SSR.

import { carregarPdfjs } from "@/lib/pdfjs";

/** Extrai todo o texto de um PDF (usado para ler os códigos do BOM). */
export async function extrairTextoPdf(file: File): Promise<string> {
  const pdfjs = await carregarPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    let texto = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      texto += " " + content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    }
    return texto;
  } finally {
    await doc.destroy();
  }
}

export interface ParteMerge {
  nome: string;
  bytes: Uint8Array;
}

export interface FalhaPdf {
  nome: string;
  /** Por que o arquivo não entrou. Sem isso não dá para diagnosticar nada. */
  motivo: string;
}

export interface ResultadoMerge {
  bytes: Uint8Array;
  paginas: number;
  /** Nomes dos PDFs que não entraram nem rasterizados, com o motivo. */
  falhas: FalhaPdf[];
  /** Nomes dos PDFs que o pdf-lib recusou e entraram como imagem. */
  resgatados: string[];
}

/** Uma página já rasterizada, no tamanho original em pontos do PDF. */
export interface PaginaRaster {
  png: Uint8Array;
  larguraPt: number;
  alturaPt: number;
}

export type Rasterizador = (bytes: Uint8Array) => Promise<PaginaRaster[]>;

// Resolução do resgate. 200 DPI mantém legível a cota e o texto miúdo da
// prancha na impressão; o teto de pixels evita estourar a memória do navegador
// numa folha A0 (a escala cai proporcionalmente em vez de travar a aba).
const DPI_RESGATE = 200;
const MAX_PIXELS_POR_PAGINA = 24_000_000;

/**
 * Escala de renderização para o resgate: o alvo é DPI_RESGATE, reduzido quando
 * a folha for grande demais para caber no teto de pixels.
 */
export function escalaDoResgate(
  larguraPt: number,
  alturaPt: number,
  dpi = DPI_RESGATE,
  maxPixels = MAX_PIXELS_POR_PAGINA,
): number {
  const escala = dpi / 72;
  const pixels = larguraPt * escala * alturaPt * escala;
  if (!Number.isFinite(pixels) || pixels <= 0 || pixels <= maxPixels) return escala;
  return Math.max(1, escala * Math.sqrt(maxPixels / pixels));
}

/**
 * Traduz o erro do pdf-lib para algo que o usuário da fábrica consiga agir.
 * A mensagem crua vai junto porque é o que permite diagnosticar um caso novo.
 */
export function motivoDaFalha(e: unknown): string {
  const bruto = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").trim();
  if (/encrypt|password/i.test(bruto)) return "PDF protegido (senha ou restrição de permissões)";
  if (/no pdf header|not a pdf|invalid pdf/i.test(bruto)) return "arquivo não é um PDF válido";
  return bruto.slice(0, 140) || "erro desconhecido ao ler o PDF";
}

/**
 * Renderiza cada página com o pdfjs e devolve os PNGs. É o plano B para PDF que
 * o pdf-lib recusa: o pdfjs é o leitor do Firefox e abre praticamente tudo que
 * o Acrobat abre, inclusive PDF com estrutura fora do padrão ou protegido por
 * restrição de permissões. A página entra como imagem, então perde o texto
 * selecionável, mas imprime igual, que é o que a prancha precisa.
 */
async function rasterizarComPdfjs(bytes: Uint8Array): Promise<PaginaRaster[]> {
  const pdfjs = await carregarPdfjs();
  // Cópia própria: o pdfjs assume a posse do buffer que recebe.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const paginas: PaginaRaster[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: escalaDoResgate(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("navegador não permitiu criar o canvas do resgate");
      // Prancha é desenho de linha: sem fundo branco explícito o PNG sai com
      // transparência e a impressão pode vir cinza.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // intent "print" desenha a folha como ela vai para a impressora (sem
      // anotação de tela), que é o destino da prancha.
      await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      // Libera a memória do canvas antes da próxima folha.
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error("não consegui gerar a imagem da página");
      paginas.push({
        png: new Uint8Array(await blob.arrayBuffer()),
        larguraPt: base.width,
        alturaPt: base.height,
      });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return paginas;
}

/**
 * Junta as partes na ordem recebida num PDF único. Um PDF que o pdf-lib recusa
 * não é descartado: é rasterizado pelo pdfjs e entra como imagem, para a
 * compilação nunca sair com menos folhas do que a lista mostrou. Só quando os
 * dois leitores falham o arquivo vira falha, aí com o motivo.
 */
export async function juntarPdfs(
  partes: ParteMerge[],
  rasterizar: Rasterizador = rasterizarComPdfjs,
): Promise<ResultadoMerge> {
  const { PDFDocument } = await import("pdf-lib");
  const saida = await PDFDocument.create();
  const falhas: FalhaPdf[] = [];
  const resgatados: string[] = [];

  for (const parte of partes) {
    try {
      const src = await PDFDocument.load(parte.bytes, { ignoreEncryption: true });
      // ignoreEncryption faz o load PASSAR num PDF protegido, mas o pdf-lib não
      // decifra: as páginas copiadas sairiam em branco ou embaralhadas, e sem
      // erro nenhum. Melhor mandar para o resgate, que o pdfjs decifra.
      if (src.isEncrypted) throw new Error("PDF encrypted: o pdf-lib não decifra o conteúdo");
      const copiadas = await saida.copyPages(src, src.getPageIndices());
      for (const p of copiadas) saida.addPage(p);
    } catch (e) {
      const motivo = motivoDaFalha(e);
      // Marco para desfazer: se o resgate quebrar na 3ª folha de uma prancha de
      // 5, as duas já embutidas ficariam no PDF final e mesmo assim o arquivo
      // seria anunciado como falha. Meia prancha impressa é pior que nenhuma.
      const paginasAntes = saida.getPageCount();
      try {
        const rasters = await rasterizar(parte.bytes);
        if (rasters.length === 0) throw new Error("o PDF não tem página nenhuma");
        for (const r of rasters) {
          const img = await saida.embedPng(r.png);
          const page = saida.addPage([r.larguraPt, r.alturaPt]);
          page.drawImage(img, { x: 0, y: 0, width: r.larguraPt, height: r.alturaPt });
        }
        resgatados.push(parte.nome);
      } catch (e2) {
        while (saida.getPageCount() > paginasAntes) saida.removePage(saida.getPageCount() - 1);
        falhas.push({ nome: parte.nome, motivo: `${motivo}; o resgate também falhou: ${motivoDaFalha(e2)}` });
      }
    }
  }

  // A contagem sai do próprio documento, e não de um contador à parte: assim
  // ela não tem como divergir do que de fato foi impresso. Tem que ser ANTES do
  // save(): PDF não pode ter zero página, então o pdf-lib insere uma em branco
  // ao salvar documento vazio, e contar depois diria "1 página" numa compilação
  // em que nada entrou.
  const paginas = saida.getPageCount();
  const bytes = await saida.save();
  return { bytes, paginas, falhas, resgatados };
}

// Utilitários de PDF do compilador de pranchas. Rodam SÓ no navegador: pdfjs
// (leitura do texto do BOM) e pdf-lib (junção das pranchas num PDF único). São
// importados dinamicamente para não entrarem no bundle das outras telas nem
// tentarem rodar no SSR.

// O worker do pdfjs é servido de /public (copiado de
// node_modules/pdfjs-dist/build/pdf.worker.min.mjs). Se a versão do pdfjs-dist
// mudar, recopie o worker. Se o worker não carregar, o pdfjs cai para o modo
// "sem worker" (thread principal) e a leitura ainda funciona.
const PDF_WORKER_SRC = "/pdf.worker.min.mjs";

/** Extrai todo o texto de um PDF (usado para ler os códigos do BOM). */
export async function extrairTextoPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
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

export interface ResultadoMerge {
  bytes: Uint8Array;
  paginas: number;
  falhas: string[]; // nomes dos PDFs que não deu para ler (corrompido/protegido)
}

/**
 * Junta as partes na ordem recebida num PDF único. Um PDF ilegível não derruba
 * a compilação: entra na lista de falhas e os demais seguem.
 */
export async function juntarPdfs(partes: ParteMerge[]): Promise<ResultadoMerge> {
  const { PDFDocument } = await import("pdf-lib");
  const saida = await PDFDocument.create();
  const falhas: string[] = [];
  let paginas = 0;
  for (const parte of partes) {
    try {
      const src = await PDFDocument.load(parte.bytes, { ignoreEncryption: true });
      const copiadas = await saida.copyPages(src, src.getPageIndices());
      for (const p of copiadas) {
        saida.addPage(p);
        paginas++;
      }
    } catch {
      falhas.push(parte.nome);
    }
  }
  const bytes = await saida.save();
  return { bytes, paginas, falhas };
}

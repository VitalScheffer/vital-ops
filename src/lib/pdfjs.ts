// Carregamento do pdfjs, compartilhado pelo compilador de pranchas e pelo
// leitor de BOM em PDF do cadastro de produtos.
//
// O worker é servido de /public (copiado de
// node_modules/pdfjs-dist/build/pdf.worker.min.mjs). Se a versão do pdfjs-dist
// mudar, recopie o worker. Se o worker não carregar, o pdfjs cai para o modo
// "sem worker" (thread principal) e a leitura ainda funciona.
//
// O import é dinâmico para o pdfjs não entrar no bundle das outras telas nem
// tentar rodar no SSR.
const PDF_WORKER_SRC = "/pdf.worker.min.mjs";

export async function carregarPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  return pdfjs;
}

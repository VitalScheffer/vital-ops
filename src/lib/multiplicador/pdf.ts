import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { extrairItensDeTexto, type ItemTexto } from "@/lib/bom/bomPdf";
import { normalizarCabecalho } from "@/lib/texto";

import {
  multiplicarNumero,
  validarColunasSelecionadas,
  type ArquivoGerado,
  type ColunasBom,
  type OpcoesMultiplicacao,
} from "./celulas";

export interface ValorPdf {
  antigo: string;
  novo: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  esquerdaDaColuna: number;
}

function ehQuantidade(texto: string): boolean {
  return texto.includes("qtd") || texto.includes("quantidade");
}

function ehPeso(texto: string): boolean {
  return (texto.startsWith("peso") || texto.startsWith("massa")) && !texto.includes("total");
}

function cabecalhoDaTabela(itens: ItemTexto[]): ItemTexto[] | null {
  for (const candidato of itens) {
    const y = candidato.y;
    const linha = itens
      .filter((item) => Math.abs(item.y - y) <= Math.max(2, candidato.altura * 0.6))
      .sort((a, b) => a.x - b.x);
    const nomes = linha.map((item) => normalizarCabecalho(item.texto));
    if (nomes.some((nome) => nome.includes("peca") || nome.includes("descric")) && nomes.some(ehQuantidade)) {
      return linha;
    }
  }
  return null;
}

function colunasDaLinha(cabecalho: ItemTexto[]): { colunas: ColunasBom; limites: number[] } {
  const nomes = cabecalho.map((item) => normalizarCabecalho(item.texto));
  const colunas = { quantidade: nomes.findIndex(ehQuantidade), peso: nomes.findIndex(ehPeso) };
  const limites = [Number.NEGATIVE_INFINITY];
  for (let i = 1; i < cabecalho.length; i++) limites.push((cabecalho[i - 1].x + cabecalho[i - 1].largura + cabecalho[i].x) / 2);
  limites.push(Number.POSITIVE_INFINITY);
  return { colunas, limites };
}

function colunaDe(x: number, limites: number[]): number {
  for (let indice = limites.length - 2; indice >= 0; indice--) if (x >= limites[indice]) return indice;
  return 0;
}

function textoNumero(valor: number, original: string): string {
  if (original.includes(",")) {
    const casas = original.split(",")[1]?.length ?? 0;
    return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }
  return Number.isInteger(valor) ? String(valor) : String(valor);
}

export function mapearValoresDaPagina(itens: ItemTexto[], opcoes: OpcoesMultiplicacao): ValorPdf[] {
  const cabecalho = cabecalhoDaTabela(itens);
  if (!cabecalho) throw new Error("Não encontrei uma tabela de BOM digital com PEÇA e QTD neste PDF.");
  const { colunas, limites } = colunasDaLinha(cabecalho);
  validarColunasSelecionadas(colunas, opcoes);
  const yCabecalho = cabecalho[0].y;
  const desejadas = new Set<number>([
    ...(opcoes.quantidade ? [colunas.quantidade] : []),
    ...(opcoes.peso ? [colunas.peso] : []),
  ]);

  return itens.flatMap((item) => {
    if (item.y >= yCabecalho || !desejadas.has(colunaDe(item.x, limites))) return [];
    try {
      const multiplicado = multiplicarNumero(item.texto, opcoes.fator);
      return [
        {
          antigo: item.texto,
          novo: textoNumero(multiplicado, item.texto),
          x: item.x,
          y: item.y,
          largura: item.largura,
          altura: item.altura,
          esquerdaDaColuna: limites[colunaDe(item.x, limites)],
        },
      ];
    } catch {
      return [];
    }
  });
}

function nomeMultiplicado(nome: string): string {
  return nome.toLowerCase().endsWith(".pdf") ? `${nome.slice(0, -4)}-multiplicado.pdf` : `${nome}-multiplicado.pdf`;
}

export async function multiplicarPdf(file: File, opcoes: OpcoesMultiplicacao): Promise<ArquivoGerado> {
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Formato de PDF inválido.");
  const [paginasTexto, origemBytes] = await Promise.all([extrairItensDeTexto(file), file.arrayBuffer()]);
  // Um arquivo pode ter capa ou folhas de detalhe sem a tabela. Elas entram
  // intactas; só as páginas com BOM reconhecida recebem sobreposição.
  const mapeamentos = paginasTexto.map((itens) => {
    try {
      return mapearValoresDaPagina(itens, opcoes);
    } catch {
      return [];
    }
  });
  if (mapeamentos.every((valores) => valores.length === 0)) throw new Error("Não encontrei valores numéricos para multiplicar neste PDF.");

  const origem = await PDFDocument.load(origemBytes, { ignoreEncryption: true });
  if (origem.isEncrypted) throw new Error("PDF protegido por senha não pode ser multiplicado.");
  const saida = await PDFDocument.create();
  const paginas = await saida.copyPages(origem, origem.getPageIndices());
  paginas.forEach((pagina) => saida.addPage(pagina));
  const fonte = await saida.embedFont(StandardFonts.Helvetica);

  mapeamentos.forEach((valores, indice) => {
    const pagina = saida.getPage(indice);
    for (const valor of valores) {
      const tamanho = Math.max(6, valor.altura);
      const larguraNova = fonte.widthOfTextAtSize(valor.novo, tamanho);
      const esquerda = Math.max(valor.esquerdaDaColuna + 1, valor.x + valor.largura - larguraNova - 1);
      pagina.drawRectangle({ x: esquerda, y: valor.y - 1, width: valor.x + valor.largura - esquerda + 1, height: tamanho + 2, color: rgb(1, 1, 1) });
      pagina.drawText(valor.novo, { x: valor.x + valor.largura - larguraNova, y: valor.y, size: tamanho, font: fonte, color: rgb(0, 0, 0) });
    }
  });

  return { nome: nomeMultiplicado(file.name), bytes: new Uint8Array(await saida.save()), mime: "application/pdf" };
}

export async function juntarPdfsMultiplicados(arquivos: ArquivoGerado[]): Promise<Uint8Array> {
  const saida = await PDFDocument.create();
  for (const arquivo of arquivos) {
    const origem = await PDFDocument.load(arquivo.bytes, { ignoreEncryption: true });
    if (origem.isEncrypted) throw new Error(`O PDF ${arquivo.nome} está protegido.`);
    const paginas = await saida.copyPages(origem, origem.getPageIndices());
    paginas.forEach((pagina) => saida.addPage(pagina));
  }
  return new Uint8Array(await saida.save());
}

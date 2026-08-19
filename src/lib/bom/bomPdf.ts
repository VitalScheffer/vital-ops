// Leitura da BOM exportada em PDF.
//
// Existe porque o SolidWorks de algumas máquinas não exporta a planilha (.xls),
// mas o PDF toda máquina gera. O objetivo é chegar na MESMA grade que o SheetJS
// devolve para o .xls, para o resto do fluxo (detecção de cabeçalho, Nº / PEÇA /
// QTD / PESO / DESCRIÇÃO) continuar sendo um caminho só.
//
// PDF não tem célula: tem texto com coordenada. A tabela é remontada em três
// passos, todos pela posição:
//   1. agrupar os textos em LINHAS pelo Y (mesma linha de base);
//   2. achar a linha de CABEÇALHO (a que reúne mais nomes de coluna de BOM);
//   3. usar as colunas do cabeçalho como régua e encaixar cada texto das linhas
//      de baixo na coluna cujo intervalo contém o começo dele.
//
// A régua vinda do cabeçalho é o que faz uma célula VAZIA (peso em branco, por
// exemplo) não empurrar as seguintes para a esquerda, que é o erro clássico de
// quem remonta tabela de PDF só por espaçamento.

import { carregarPdfjs } from "@/lib/pdfjs";
import { normalizarCabecalho } from "@/lib/texto";

/** Um pedaço de texto do PDF com onde ele está na folha (pontos, origem embaixo). */
export interface ItemTexto {
  texto: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface GradePagina {
  cabecalho: string[];
  linhas: string[][];
}

// Colunas que uma BOM do CAD tem. O cabeçalho é reconhecido por QUANTAS destas
// a linha satisfaz, não pela primeira que casar: numa prancha o texto do
// carimbo e das notas concorre com a tabela, e a linha certa é a que reúne
// vários nomes de coluna.
const COLUNAS_CONHECIDAS: ((c: string) => boolean)[] = [
  (c) => c.includes("peca"),
  (c) => c.includes("descric"),
  (c) => c === "n" || c === "no" || c.includes("item") || c.includes("numero"),
  (c) => c.includes("qtd") || c.includes("quantidade"),
  (c) => c.startsWith("peso") || c.startsWith("massa"),
  (c) => c.includes("materia") || c.includes("material"),
];

// A linha de cabeçalho precisa ter a coluna da peça (é o que o leitor da grade
// exige) e pelo menos mais uma coluna conhecida, senão qualquer texto solto com
// a palavra "descrição" viraria tabela.
const MIN_COLUNAS_CABECALHO = 2;

// Um texto começa célula nova quando o vão até o texto anterior passa disto (em
// múltiplos da altura da fonte). Vão entre palavras da mesma célula fica bem
// abaixo; vão entre colunas fica bem acima.
const VAO_ENTRE_CELULAS = 0.9;

// Tolerância de Y para dois textos serem da mesma linha, em múltiplos da altura.
const TOLERANCIA_LINHA = 0.5;

// Margem lateral aceita fora da tabela, em múltiplos da altura: o que cair fora
// disso é carimbo ou nota da prancha, não é linha de BOM.
const MARGEM_LATERAL = 2;

// A tabela acaba quando aparece um vão vertical muito maior que o MAIOR passo
// já visto entre linhas (começou o resto da prancha). A referência é o maior, e
// não a média: dentro da tabela o passo varia (linha de continuação é menor,
// separador de submontagem é maior) e cortar no meio da BOM seria pior que
// engolir uma linha do carimbo — a linha do carimbo aparece na tela para o
// usuário conferir, a peça que sumiu não aparece em lugar nenhum.
const VAO_FIM_DA_TABELA = 3;

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 0 ? (ord[meio - 1] + ord[meio]) / 2 : ord[meio];
}

/** Agrupa os textos em linhas pela coordenada Y, de cima para baixo. */
function agruparEmLinhas(itens: ItemTexto[], tolerancia: number): ItemTexto[][] {
  const ordenados = [...itens].sort((a, b) => b.y - a.y);
  const linhas: ItemTexto[][] = [];
  let atual: ItemTexto[] = [];
  let yAtual = 0;
  for (const item of ordenados) {
    if (atual.length === 0) {
      atual = [item];
      yAtual = item.y;
    } else if (Math.abs(item.y - yAtual) <= tolerancia) {
      atual.push(item);
    } else {
      linhas.push(atual);
      atual = [item];
      yAtual = item.y;
    }
  }
  if (atual.length > 0) linhas.push(atual);
  return linhas.map((l) => [...l].sort((a, b) => a.x - b.x));
}

interface Celula {
  texto: string;
  inicio: number;
  fim: number;
}

/** Junta os textos de uma linha em células, cortando nos vãos largos. */
function celulasDaLinha(linha: ItemTexto[], vaoMinimo: number): Celula[] {
  const celulas: Celula[] = [];
  for (const item of linha) {
    const ultima = celulas[celulas.length - 1];
    if (ultima && item.x - ultima.fim <= vaoMinimo) {
      ultima.texto = `${ultima.texto} ${item.texto}`.replace(/\s{2,}/g, " ");
      ultima.fim = Math.max(ultima.fim, item.x + item.largura);
    } else {
      celulas.push({ texto: item.texto, inicio: item.x, fim: item.x + item.largura });
    }
  }
  return celulas.map((c) => ({ ...c, texto: c.texto.trim() }));
}

/** Quantas colunas conhecidas de BOM esta linha reúne. */
function pontuarCabecalho(celulas: Celula[]): { pontos: number; temPeca: boolean } {
  const chaves = celulas.map((c) => normalizarCabecalho(c.texto)).filter(Boolean);
  return {
    pontos: COLUNAS_CONHECIDAS.filter((casa) => chaves.some(casa)).length,
    temPeca: chaves.some((c) => c.includes("peca") || c.includes("descric")),
  };
}

/**
 * Fronteiras entre as colunas: o meio do vão entre uma célula do cabeçalho e a
 * seguinte. A primeira coluna começa no infinito negativo e a última termina no
 * infinito positivo, para não perder texto que transborde a largura do título da
 * coluna (uma descrição longa, por exemplo).
 */
function fronteirasDasColunas(cabecalho: Celula[]): number[] {
  const fronteiras: number[] = [Number.NEGATIVE_INFINITY];
  for (let i = 1; i < cabecalho.length; i++) {
    fronteiras.push((cabecalho[i - 1].fim + cabecalho[i].inicio) / 2);
  }
  fronteiras.push(Number.POSITIVE_INFINITY);
  return fronteiras;
}

function colunaDe(x: number, fronteiras: number[]): number {
  for (let i = fronteiras.length - 2; i >= 0; i--) {
    if (x >= fronteiras[i]) return i;
  }
  return 0;
}

/**
 * Remonta a tabela de UMA página. Devolve null quando a página não tem linha de
 * cabeçalho de BOM (capa, folha de detalhe, continuação sem cabeçalho).
 */
export function montarGradeDaPagina(itens: ItemTexto[]): GradePagina | null {
  const limpos = itens.filter((i) => i.texto.trim() !== "");
  if (limpos.length === 0) return null;

  const alturaBase = mediana(limpos.map((i) => i.altura).filter((h) => h > 0)) || 10;
  const linhas = agruparEmLinhas(limpos, Math.max(1, alturaBase * TOLERANCIA_LINHA));
  const vao = Math.max(1, alturaBase * VAO_ENTRE_CELULAS);

  let idxCabecalho = -1;
  let cabecalho: Celula[] = [];
  let melhor = 0;
  for (let i = 0; i < linhas.length; i++) {
    const celulas = celulasDaLinha(linhas[i], vao);
    const { pontos, temPeca } = pontuarCabecalho(celulas);
    if (temPeca && pontos >= MIN_COLUNAS_CABECALHO && pontos > melhor) {
      melhor = pontos;
      idxCabecalho = i;
      cabecalho = celulas;
    }
  }
  if (idxCabecalho === -1) return null;

  const fronteiras = fronteirasDasColunas(cabecalho);
  // Coluna da peça, pela mesma regra do leitor da grade. Linha sem peça é
  // continuação da anterior (ver adiante), não item novo.
  const idxPeca = cabecalho.findIndex((c) => {
    const chave = normalizarCabecalho(c.texto);
    return chave.includes("peca") || chave.includes("descric");
  });
  const esquerda = cabecalho[0].inicio - alturaBase * MARGEM_LATERAL;
  const direita = cabecalho[cabecalho.length - 1].fim + alturaBase * MARGEM_LATERAL;

  const saida: string[][] = [];
  const passos: number[] = [];
  let yAnterior = linhas[idxCabecalho][0].y;

  for (let i = idxCabecalho + 1; i < linhas.length; i++) {
    const dentro = linhas[i].filter((it) => it.x + it.largura >= esquerda && it.x <= direita);
    if (dentro.length === 0) continue;

    const passo = yAnterior - dentro[0].y;
    // Vão vertical grande demais: a tabela acabou e o que vem abaixo é a
    // prancha (carimbo, notas). Basta UM passo de referência, senão uma BOM de
    // item único fica sem proteção nenhuma e engole o carimbo inteiro.
    const maiorPasso = passos.length > 0 ? Math.max(...passos) : 0;
    if (maiorPasso > 0 && passo > maiorPasso * VAO_FIM_DA_TABELA) break;
    passos.push(passo);
    yAnterior = dentro[0].y;

    const celulas: string[] = new Array(cabecalho.length).fill("");
    for (const it of dentro) {
      const col = colunaDe(it.x, fronteiras);
      const texto = it.texto.trim();
      celulas[col] = celulas[col] ? `${celulas[col]} ${texto}` : texto;
    }
    if (celulas.every((c) => c === "")) continue;

    // Descrição longa: o CAD quebra o texto em duas linhas DENTRO da mesma
    // célula. Sai uma linha sem peça, que é continuação da anterior e não item
    // novo. Sem juntar aqui, o leitor da grade descartaria a linha (ele exige
    // peça) e a especificação da matéria-prima chegaria cortada ao Omie.
    const anterior = saida[saida.length - 1];
    if (anterior && idxPeca >= 0 && celulas[idxPeca] === "") {
      celulas.forEach((valor, i) => {
        if (valor) anterior[i] = anterior[i] ? `${anterior[i]} ${valor}` : valor;
      });
      continue;
    }
    saida.push(celulas);
  }

  return { cabecalho: cabecalho.map((c) => c.texto), linhas: saida };
}

/**
 * Junta as páginas numa grade só. O cabeçalho da primeira página válida vira a
 * régua; nas seguintes (o CAD repete o cabeçalho quando a BOM quebra de folha)
 * as colunas são remapeadas pelo NOME, para uma ordem diferente não desalinhar
 * tudo, e o cabeçalho repetido não vira linha de peça.
 */
export function juntarPaginas(paginas: (GradePagina | null)[]): string[][] {
  const validas = paginas.filter((p): p is GradePagina => p !== null && p.cabecalho.length > 0);
  if (validas.length === 0) return [];

  const base = validas[0].cabecalho;
  const chaveBase = base.map(normalizarCabecalho);
  const grade: string[][] = [base];

  for (const pagina of validas) {
    const mesma =
      pagina.cabecalho.length === base.length &&
      pagina.cabecalho.every((c, i) => normalizarCabecalho(c) === chaveBase[i]);
    if (mesma) {
      grade.push(...pagina.linhas);
      continue;
    }
    const destino = pagina.cabecalho.map((c) => chaveBase.indexOf(normalizarCabecalho(c)));
    for (const linha of pagina.linhas) {
      const remapeada: string[] = new Array(base.length).fill("");
      linha.forEach((valor, i) => {
        const alvo = destino[i];
        if (alvo >= 0) remapeada[alvo] = valor;
      });
      grade.push(remapeada);
    }
  }
  return grade;
}

/** Lê o texto do PDF com a posição de cada pedaço, página a página. */
export async function extrairItensDeTexto(file: File): Promise<ItemTexto[][]> {
  const pdfjs = await carregarPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    const paginas: ItemTexto[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const itens: ItemTexto[] = [];
      for (const it of content.items) {
        if (!("str" in it)) continue;
        // transform = [a, b, c, d, e, f]: "e" e "f" são x e y; "d" é a altura
        // efetiva da fonte depois da escala do texto.
        const [, , , d, x, y] = it.transform;
        itens.push({
          texto: it.str,
          x,
          y,
          largura: it.width,
          altura: Math.abs(d) || it.height,
        });
      }
      paginas.push(itens);
      page.cleanup();
    }
    return paginas;
  } finally {
    await doc.destroy();
  }
}

/**
 * Lê a BOM de um PDF e devolve a grade (mesma forma que o SheetJS devolve para
 * o .xls). Grade vazia = nenhuma página tinha tabela de BOM reconhecível.
 * Roda só no navegador: o pdfjs é importado sob demanda.
 */
export async function extrairGradeDoPdf(file: File): Promise<string[][]> {
  const paginas = await extrairItensDeTexto(file);
  return juntarPaginas(paginas.map(montarGradeDaPagina));
}

import { lerBomDeArquivo } from "@/lib/bom/bomFile";
import type { BomRow } from "@/lib/bom/types";

import { extractItems, parseCode, parseCodeFromFileName, type DrawingCode } from "./codes";
import { extrairTextoPdf } from "./pdf";

export interface ItemBom {
  code: DrawingCode;
  numero: string; // numeração hierárquica da BOM ("1", "1.1"); "" quando veio de PDF
  quantidade: number; // quantidade da própria linha
  quantidadeEfetiva: number; // quantidade × a dos pais (o que de fato vai para a peça)
}

export interface ConteudoBom {
  /** Desenhos na ordem em que aparecem, sem repetir: o que o compilador imprime. */
  desenhos: DrawingCode[];
  /** Toda linha com código (desenho e comprado), uma entrada por linha da BOM. */
  itens: ItemBom[];
  /**
   * Chave do próprio conjunto (derivada do nome do arquivo do BOM), para a
   * opção de incluir a prancha da montagem. null se o nome não tiver código.
   */
  parentKey: string | null;
  /**
   * false quando não deu para separar as colunas do BOM (PDF sem tabela
   * reconhecível): sobra só a lista de códigos do texto corrido, sem
   * quantidade. A lista de materiais depende disso.
   */
  temQuantidades: boolean;
}

/**
 * Sobe a numeração hierárquica multiplicando as quantidades: um item "6.1" com
 * QTD 1 dentro de um conjunto "6" com QTD 2 entra 2 vezes no produto final.
 * Sem isso a lista de separação sai curta.
 */
function calcularEfetiva(numero: string, qtd: number, qtdPorNumero: Map<string, number>): number {
  let total = qtd;
  let atual = numero;
  while (atual.includes(".")) {
    atual = atual.slice(0, atual.lastIndexOf("."));
    total *= qtdPorNumero.get(atual) ?? 1;
  }
  return total;
}

/** Cada linha da BOM é lida isoladamente, então a quantidade vem da coluna certa. */
function conteudoDasLinhas(rows: BomRow[], parentKey: string | null): ConteudoBom {
  const qtdPorNumero = new Map<string, number>();
  for (const row of rows) {
    const numero = row.numero.trim();
    if (numero) qtdPorNumero.set(numero, row.quantidade ?? 1);
  }

  const itens: ItemBom[] = [];
  const desenhos: DrawingCode[] = [];
  const vistos = new Set<string>();

  for (const row of rows) {
    const code = parseCode(row.peca.trim());
    if (!code) continue;
    const numero = row.numero.trim();
    const quantidade = row.quantidade ?? 1;
    itens.push({
      code,
      numero,
      quantidade,
      quantidadeEfetiva: calcularEfetiva(numero, quantidade, qtdPorNumero),
    });
    if (!code.comercial && !vistos.has(code.key)) {
      vistos.add(code.key);
      desenhos.push(code);
    }
  }

  return { desenhos, itens, parentKey, temQuantidades: true };
}

/**
 * Lê o arquivo principal (BOM) e devolve os códigos de desenho na ordem em que
 * aparecem. Aceita o PDF do conjunto ou a planilha .xls/.xlsx exportada do CAD
 * (mesmo leitor do módulo Produtos).
 *
 * No PDF a tabela é remontada por coordenada, então o normal é sair COM
 * quantidade (a lista de materiais funciona). A leitura por tabela é sempre
 * conferida contra a varredura do texto corrido: se o texto tiver um desenho
 * que a tabela não trouxe, a tabela veio incompleta e o plano B assume. Sair
 * com prancha a menos é justamente o que este compilador existe para evitar,
 * então perder a quantidade é o preço aceitável.
 */
export async function lerCodigosDoBom(file: File): Promise<ConteudoBom> {
  const parentKey = parseCodeFromFileName(file.name)?.key ?? null;

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return conteudoDasLinhas(await lerBomDeArquivo(file), parentKey);
  }

  let porTabela: ConteudoBom | null = null;
  let erroDaTabela: unknown = null;
  try {
    porTabela = conteudoDasLinhas(await lerBomDeArquivo(file), parentKey);
  } catch (e) {
    erroDaTabela = e;
  }

  const doTexto = extractItems(await extrairTextoPdf(file)).filter((c) => !c.comercial);

  if (porTabela) {
    const naTabela = new Set(porTabela.desenhos.map((d) => d.key));
    // O próprio conjunto aparece no carimbo da folha e não é linha da BOM, por
    // isso fica de fora da comparação.
    const faltando = doTexto.filter((d) => d.key !== parentKey && !naTabela.has(d.key));
    if (faltando.length === 0) return porTabela;
  }

  if (doTexto.length > 0) {
    return { desenhos: doTexto, itens: [], parentKey, temQuantidades: false };
  }

  // Nem tabela nem texto: se a leitura da tabela falhou, o erro dela é o que
  // explica o problema para o usuário (o do pdfjs é interno e não ajuda).
  if (erroDaTabela) throw erroDaTabela;
  return porTabela ?? { desenhos: [], itens: [], parentKey, temQuantidades: false };
}

import { lerBomDeArquivo } from "@/lib/bom/bomFile";

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
   * false quando o BOM veio em PDF: o texto extraído não tem colunas, então não
   * dá para separar quantidade de descrição com confiança. A lista de materiais
   * depende disso.
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

/**
 * Lê o arquivo principal (BOM) e devolve os códigos de desenho na ordem em que
 * aparecem. Aceita o PDF do conjunto ou a planilha .xls/.xlsx exportada do CAD
 * (mesmo leitor do módulo Produtos).
 */
export async function lerCodigosDoBom(file: File): Promise<ConteudoBom> {
  const parentKey = parseCodeFromFileName(file.name)?.key ?? null;

  if (file.name.toLowerCase().endsWith(".pdf")) {
    const desenhos = extractItems(await extrairTextoPdf(file)).filter((c) => !c.comercial);
    return { desenhos, itens: [], parentKey, temQuantidades: false };
  }

  // Planilha: cada linha é lida isoladamente, então a descrição sai limpa
  // (vem da própria célula) e a quantidade vem da coluna certa.
  const rows = await lerBomDeArquivo(file);

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

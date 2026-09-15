// Transforma os itens de uma Ordem de Produção numa planilha que o próprio
// Multiplicador sabe processar.
//
// A ideia é não abrir um caminho paralelo: a OP entra na lista como se fosse um
// arquivo que a pessoa subiu, e daí para frente valem o fator, o download, o
// ZIP e o lote que já existem. Para isso a planilha precisa ter um cabeçalho
// que o `localizarColunas` reconheça — daí a coluna se chamar `QTD`.
//
// O cabeçalho fica na PRIMEIRA linha, sem título nem cabeçalho de relatório em
// cima. O `multiplicarAba` varre as 20 primeiras linhas procurando o cabeçalho,
// então um título até funcionaria, mas linha decorativa acima de dado é
// exatamente o que costuma quebrar leitura de planilha mais tarde. A
// identificação da OP vive no nome do arquivo e no nome da aba.

import * as XLSX from "xlsx";

import type { GrupoItem } from "@/lib/estoque/omieOp";

export interface LinhaOpPlanilha {
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  /** MAT/COM/SBM/PECA/OUTRO — a família do cadastro no Omie. */
  grupo?: GrupoItem;
}

export const COLUNAS_OP = ["CÓDIGO", "DESCRIÇÃO", "TIPO", "UNIDADE", "QTD"] as const;

const TIPO_PADRAO: GrupoItem = "OUTRO";

export interface GrupoProduto {
  codigo: string;
  unidade: string;
  tipo: GrupoItem;
  /** As linhas do produto, na ordem em que saem da OP. */
  itens: LinhaOpPlanilha[];
  /** Soma das linhas, na unidade do próprio produto. */
  total: number;
}

/**
 * Junta as linhas do MESMO produto, preservando a ordem da primeira aparição.
 *
 * O Omie repete o item uma vez por peça que o consome: na OP 2026/00802 o
 * `MATTB RD190 12I43` sai com 263,745 e depois com 203,058, porque entra em
 * duas peças diferentes. A planilha continua mostrando as duas linhas (é como a
 * OP sai), e o total do produto vai logo abaixo delas.
 *
 * A soma é SEMPRE por produto, nunca por tipo: somar tubos e chapas diferentes
 * num "total MAT" daria um número que não significa nada, porque cada cadastro
 * tem a sua unidade. Por isso o total sai na unidade do próprio produto.
 */
export function agruparPorProduto(itens: readonly LinhaOpPlanilha[]): GrupoProduto[] {
  const grupos = new Map<string, GrupoProduto>();
  for (const item of itens) {
    const atual = grupos.get(item.codigo);
    if (atual) {
      atual.itens.push(item);
      atual.total += item.quantidade;
      continue;
    }
    grupos.set(item.codigo, {
      codigo: item.codigo,
      unidade: item.unidade,
      tipo: item.grupo ?? TIPO_PADRAO,
      itens: [item],
      total: item.quantidade,
    });
  }
  // Mesmo cuidado do agregarItens: 0,1 + 0,2 vira 0,30000000000000004 e isso ia
  // parar na planilha que a fábrica lê.
  for (const grupo of grupos.values()) grupo.total = Number(grupo.total.toFixed(4));
  return [...grupos.values()];
}

/**
 * Nome de arquivo/aba a partir do número da OP.
 *
 * O `cNumOP` do Omie vem com barra ("2026/00802"), que não pode aparecer em
 * nome de arquivo no Windows nem em nome de aba do Excel. Vira hífen.
 */
export function nomeDaOp(numeroOp: string): string {
  return `OP ${String(numeroOp ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-")}`.trim();
}

export function linhasDaPlanilha(itens: readonly LinhaOpPlanilha[]): (string | number)[][] {
  const linhas: (string | number)[][] = [[...COLUNAS_OP]];
  for (const grupo of agruparPorProduto(itens)) {
    for (const item of grupo.itens) {
      linhas.push([item.codigo, item.descricao, item.grupo ?? TIPO_PADRAO, item.unidade, item.quantidade]);
    }
    // Produto que só entra uma vez não ganha linha de total: ela repetiria o
    // número logo acima e só atrapalharia a leitura.
    if (grupo.itens.length > 1) {
      linhas.push([`TOTAL ${grupo.codigo}`, "", grupo.tipo, grupo.unidade, grupo.total]);
    }
  }
  return linhas;
}

/**
 * Planilha .xlsx dos itens da OP, pronta para virar um `File` na lista do
 * Multiplicador. Quantidade sai como NÚMERO (não texto): é ela que o fator
 * multiplica, e número guardado como texto vira erro na hora da multiplicação.
 *
 * As linhas saem como a OP sai (o mesmo produto pode aparecer mais de uma vez),
 * com o total do produto logo abaixo das linhas dele. O total está na coluna
 * QTD e por isso também é multiplicado pelo fator, o que é o certo: o total de
 * uma OP dobrada é o dobro.
 */
export function planilhaDaOp(
  numeroOp: string,
  itens: readonly LinhaOpPlanilha[],
): { nome: string; bytes: Uint8Array } {
  const nome = nomeDaOp(numeroOp);
  const sheet = XLSX.utils.aoa_to_sheet(linhasDaPlanilha(itens));
  sheet["!cols"] = [{ wch: 20 }, { wch: 52 }, { wch: 8 }, { wch: 10 }, { wch: 12 }];

  const workbook = XLSX.utils.book_new();
  // Nome de aba no Excel tem teto de 31 caracteres.
  XLSX.utils.book_append_sheet(workbook, sheet, nome.slice(0, 31));

  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return { nome: `${nome}.xlsx`, bytes: new Uint8Array(bytes) };
}

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

export interface LinhaOpPlanilha {
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
}

export const COLUNAS_OP = ["CÓDIGO", "DESCRIÇÃO", "UNIDADE", "QTD"] as const;

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
  return [
    [...COLUNAS_OP],
    ...itens.map((item) => [item.codigo, item.descricao, item.unidade, item.quantidade]),
  ];
}

/**
 * Planilha .xlsx dos itens da OP, pronta para virar um `File` na lista do
 * Multiplicador. Quantidade sai como NÚMERO (não texto): é ela que o fator
 * multiplica, e número guardado como texto vira erro na hora da multiplicação.
 */
export function planilhaDaOp(
  numeroOp: string,
  itens: readonly LinhaOpPlanilha[],
): { nome: string; bytes: Uint8Array } {
  const nome = nomeDaOp(numeroOp);
  const sheet = XLSX.utils.aoa_to_sheet(linhasDaPlanilha(itens));
  sheet["!cols"] = [{ wch: 20 }, { wch: 52 }, { wch: 10 }, { wch: 12 }];

  const workbook = XLSX.utils.book_new();
  // Nome de aba no Excel tem teto de 31 caracteres.
  XLSX.utils.book_append_sheet(workbook, sheet, nome.slice(0, 31));

  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return { nome: `${nome}.xlsx`, bytes: new Uint8Array(bytes) };
}

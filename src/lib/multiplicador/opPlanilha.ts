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

/**
 * Totais em KG por TIPO, na ordem em que o tipo aparece na lista.
 *
 * O Omie já repete o mesmo item uma vez por peça que o consome e a soma por
 * CÓDIGO acontece antes daqui (`agregarItens`), então o tubo chega numa linha
 * só. O que faltava era a leitura de cima: quanto de tubo (e de chapa, e de
 * comprado) essa OP puxa NO TOTAL, sem a pessoa ter que somar na calculadora.
 *
 * Só entra linha em KG: somar KG com UN ou M daria um número que não significa
 * nada. Tipo sem nenhuma linha em KG simplesmente não ganha total.
 */
export function totaisEmKgPorTipo(itens: readonly LinhaOpPlanilha[]): { tipo: GrupoItem; kg: number }[] {
  const somados = new Map<GrupoItem, number>();
  for (const item of itens) {
    if (String(item.unidade ?? "").trim().toUpperCase() !== "KG") continue;
    const tipo = item.grupo ?? TIPO_PADRAO;
    somados.set(tipo, (somados.get(tipo) ?? 0) + item.quantidade);
  }
  // Mesmo cuidado do agregarItens: 0,1 + 0,2 vira 0,30000000000000004 e isso ia
  // parar na planilha que a fábrica lê.
  return [...somados.entries()].map(([tipo, kg]) => ({ tipo, kg: Number(kg.toFixed(4)) }));
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
  const totais = totaisEmKgPorTipo(itens);
  return [
    [...COLUNAS_OP],
    ...itens.map((item) => [item.codigo, item.descricao, item.grupo ?? TIPO_PADRAO, item.unidade, item.quantidade]),
    // Linha em branco separando o material dos totais: o multiplicador pula
    // célula vazia, então ela não atrapalha o fator.
    ...(totais.length > 0 ? [["", "", "", "", ""]] : []),
    ...totais.map((total) => [`TOTAL ${total.tipo} (KG)`, "", total.tipo, "KG", total.kg]),
  ];
}

/**
 * Planilha .xlsx dos itens da OP, pronta para virar um `File` na lista do
 * Multiplicador. Quantidade sai como NÚMERO (não texto): é ela que o fator
 * multiplica, e número guardado como texto vira erro na hora da multiplicação.
 *
 * No fim vão os totais em KG por tipo. Eles também são multiplicados pelo fator
 * (estão na coluna QTD), o que é o certo: o total de uma OP dobrada é o dobro.
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

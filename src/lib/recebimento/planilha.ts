// Exportação em Excel do checklist de Recebimento de NF. Uma linha por
// produto (não por nota) — mais fácil de filtrar/ordenar no Excel do que
// células mescladas. Sem leitura/importação: essa tela não recebe planilha de
// volta, só gera.

import * as XLSX from "xlsx";

import { rotuloSemana } from "./semanas";

export interface ItemRecebimentoExport {
  produto: string;
  materialRecebido: boolean;
  temOC: boolean;
  ocAprovado: boolean;
  nfeLancada: boolean;
}

export interface NotaRecebimentoExport {
  numero: string;
  fornecedor: string;
  dataEmissao: Date;
  itens: ItemRecebimentoExport[];
}

const CABECALHO = [
  "Semana",
  "Nº NF",
  "Fornecedor",
  "Data Emissão",
  "Produto",
  "Material recebido",
  "Tem OC",
  "OC Aprovado",
  "NF-e lançada",
];

function marca(valor: boolean): string {
  return valor ? "X" : "";
}

function dataBr(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(data);
}

export function gerarRecebimentoXlsx(notas: readonly NotaRecebimentoExport[]): Uint8Array {
  const linhas: (string | number)[][] = [CABECALHO];
  for (const nota of notas) {
    for (const item of nota.itens) {
      linhas.push([
        rotuloSemana(nota.dataEmissao),
        nota.numero,
        nota.fornecedor,
        dataBr(nota.dataEmissao),
        item.produto,
        marca(item.materialRecebido),
        marca(item.temOC),
        marca(item.ocAprovado),
        marca(item.nfeLancada),
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 28 },
    { wch: 13 },
    { wch: 32 },
    { wch: 16 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recebimento");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

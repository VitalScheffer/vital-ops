import * as XLSX from "xlsx";

import type { ItemBom } from "./bom";

export interface LinhaMaterial {
  codigo: string; // "COMRT PO00G 48018"
  descricao: string;
  /** Quantidade para UM conjunto, já com a multiplicação pai×filho aplicada. */
  unitaria: number;
  /** Quantidade para o lote pedido (unitária × multiplicador). */
  total: number;
}

/**
 * Agrupa os itens comprados (família "COM*") por código, somando as
 * quantidades. Um mesmo código pode aparecer em várias linhas da BOM — em
 * conjuntos diferentes, ou repetido no mesmo — e o que interessa para a
 * separação é o total.
 *
 * @param multiplicador quantos conjuntos serão produzidos.
 */
export function agruparComerciais(itens: readonly ItemBom[], multiplicador = 1): LinhaMaterial[] {
  const porCodigo = new Map<string, LinhaMaterial>();

  for (const item of itens) {
    if (!item.code.comercial) continue;
    const existente = porCodigo.get(item.code.key);
    if (existente) {
      existente.unitaria += item.quantidadeEfetiva;
    } else {
      porCodigo.set(item.code.key, {
        codigo: item.code.key,
        descricao: item.code.desc ?? "",
        unitaria: item.quantidadeEfetiva,
        total: 0,
      });
    }
  }

  const linhas = [...porCodigo.values()];
  for (const linha of linhas) linha.total = linha.unitaria * multiplicador;
  linhas.sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR"));
  return linhas;
}

/** Monta a planilha de separação (uma aba, cabeçalho + linhas). */
export function gerarPlanilhaMateriais(
  linhas: readonly LinhaMaterial[],
  multiplicador: number,
  conjunto: string,
): Blob {
  const cabecalho = [
    ["Conjunto", conjunto],
    ["Conjuntos a produzir", multiplicador],
    [],
    ["Código", "Descrição", "Qtd. por conjunto", "Qtd. total"],
  ];
  const corpo = linhas.map((l) => [l.codigo, l.descricao, l.unitaria, l.total]);
  const sheet = XLSX.utils.aoa_to_sheet([...cabecalho, ...corpo]);
  sheet["!cols"] = [{ wch: 20 }, { wch: 60 }, { wch: 18 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Materiais");
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

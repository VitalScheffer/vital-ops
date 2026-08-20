import * as XLSX from "xlsx";

import { chaveCom, type ItemCom } from "@/lib/produtos/catalogoCom";

import type { LinhaMateriaPrima } from "./chapas";
import type { ItemBom } from "./bom";

export interface LinhaMaterial {
  codigo: string; // "COMRT PO00G 48018"
  descricao: string;
  /** Quantidade para UM conjunto, já com a multiplicação pai×filho aplicada. */
  unitaria: number;
  /** Quantidade para o lote pedido (unitária × multiplicador). */
  total: number;
  /**
   * Unidade do cadastro no Omie. Só preenchida quando o catálogo foi
   * consultado (Modo 2); `undefined` no modo clássico, que não fala com o Omie.
   */
  unidade?: string;
  /**
   * `true` = achado no cadastro do Omie; `false` = não existe (ou está inativo);
   * `undefined` = não dá para afirmar, seja porque o catálogo não foi consultado
   * (modo clássico), seja porque a leitura veio incompleta.
   */
  noOmie?: boolean;
}

/**
 * Agrupa os itens comprados (família "COM*") por código, somando as
 * quantidades. Um mesmo código pode aparecer em várias linhas da BOM — em
 * conjuntos diferentes, ou repetido no mesmo — e o que interessa para a
 * separação é o total.
 *
 * @param multiplicador quantos conjuntos serão produzidos.
 * @param catalogo cadastro dos comprados no Omie (Modo 2). Sem ele a lista sai
 * exatamente como saía antes: só código, descrição e quantidade.
 * @param catalogoCompleto `false` quando a leitura do Omie parou no meio: aí a
 * ausência de um código NÃO vira a afirmação "não está cadastrado".
 */
export function agruparComerciais(
  itens: readonly ItemBom[],
  multiplicador = 1,
  catalogo?: ReadonlyMap<string, ItemCom>,
  catalogoCompleto = true,
): LinhaMaterial[] {
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
  for (const linha of linhas) {
    linha.total = linha.unitaria * multiplicador;
    if (!catalogo) continue;
    // Unidade só sai do cadastro. Item que não está lá fica com a unidade
    // VAZIA e marcado: escrever "UN" por omissão esconderia justamente o
    // comprado que ninguém cadastrou e que vai faltar na hora de comprar.
    const cadastro = catalogo.get(chaveCom(linha.codigo));
    linha.unidade = cadastro?.unidade ?? "";
    // Não achar num catálogo truncado não é "não existe": mandaria alguém
    // recadastrar item que já está lá.
    linha.noOmie = cadastro !== undefined ? true : catalogoCompleto ? false : undefined;
  }
  linhas.sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR"));
  return linhas;
}

export interface ExtrasPlanilha {
  /** Linhas de matéria-prima do Modo 2; ausente = planilha clássica. */
  materiaPrima?: readonly LinhaMateriaPrima[];
  /** Fração da chapa aproveitada no corte, para registrar de onde saiu a conta. */
  aproveitamento?: number;
}

function rotuloNoOmie(noOmie: boolean | undefined): string {
  if (noOmie === true) return "sim";
  if (noOmie === false) return "NÃO CADASTRADO";
  return "não deu para conferir";
}

function numeroOuTexto(valor: number | null, motivo: string | undefined): number | string {
  if (valor !== null) return valor;
  return motivo ? "não calculado" : "";
}

/**
 * Monta a planilha de separação. No modo clássico sai uma aba só, igual a
 * sempre. No Modo 2 a unidade do cadastro entra na aba de comprados e a
 * matéria-prima ganha uma aba própria, com o m² e as chapas a comprar.
 */
export function gerarPlanilhaMateriais(
  linhas: readonly LinhaMaterial[],
  multiplicador: number,
  conjunto: string,
  extras: ExtrasPlanilha = {},
): Blob {
  const comUnidade = linhas.some((l) => l.unidade !== undefined);
  const cabecalho = [
    ["Conjunto", conjunto],
    ["Conjuntos a produzir", multiplicador],
    [],
    comUnidade
      ? ["Código", "Descrição", "Unidade", "Qtd. por conjunto", "Qtd. total", "No Omie"]
      : ["Código", "Descrição", "Qtd. por conjunto", "Qtd. total"],
  ];
  const corpo = linhas.map((l) =>
    comUnidade
      ? [l.codigo, l.descricao, l.unidade ?? "", l.unitaria, l.total, rotuloNoOmie(l.noOmie)]
      : [l.codigo, l.descricao, l.unitaria, l.total],
  );
  const sheet = XLSX.utils.aoa_to_sheet([...cabecalho, ...corpo]);
  sheet["!cols"] = comUnidade
    ? [{ wch: 20 }, { wch: 60 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 16 }]
    : [{ wch: 20 }, { wch: 60 }, { wch: 18 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Materiais");

  // Array vazio é objeto e passaria por truthy: a planilha sairia com uma aba
  // "Matéria-prima" só de cabeçalho.
  if (extras.materiaPrima && extras.materiaPrima.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      abaMateriaPrima(extras.materiaPrima, multiplicador, conjunto, extras.aproveitamento ?? 1),
      "Matéria-prima",
    );
  }

  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function abaMateriaPrima(
  linhas: readonly LinhaMateriaPrima[],
  multiplicador: number,
  conjunto: string,
  aproveitamento: number,
): XLSX.WorkSheet {
  const cabecalho = [
    ["Conjunto", conjunto],
    ["Conjuntos a produzir", multiplicador],
    ["Aproveitamento da chapa", `${Math.round(aproveitamento * 100)}%`],
    [],
    ["Código MAT", "Descrição", "Unidade", "Total", "m²", "Chapas a comprar", "Chapa", "Densidade (kg/m³)", "Peças", "Observação"],
  ];
  const corpo = linhas.map((l) => [
    l.codigoMat,
    l.descricaoMat,
    l.unidade,
    numeroOuTexto(l.quantidade, l.motivo),
    numeroOuTexto(l.areaM2, l.motivo),
    numeroOuTexto(l.chapas, l.motivo),
    l.medida ? `${l.medida.larguraMm}x${l.medida.comprimentoMm}` : "",
    l.densidade ?? "",
    l.pecas.join(", "),
    // A densidade estimada é um aviso por si só: quem confere precisa saber que
    // aquele m² depende de um número que varia por fornecedor.
    l.motivo ?? (l.densidadeConfirmada ? "" : "densidade estimada, confira a ficha do fornecedor"),
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([...cabecalho, ...corpo]);
  sheet["!cols"] = [
    { wch: 20 }, { wch: 55 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 60 },
  ];
  return sheet;
}

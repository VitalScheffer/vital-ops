import { describe, expect, it } from "vitest";

import type { EstruturaRel, ParsedItem } from "@/lib/bom/types";
import { observacaoComRevisao, revisoesDaBOM, revisoesDaEntrada } from "./revisoes";

function item(codigo: string, revisao?: string): ParsedItem {
  return {
    linha: 1,
    raw: codigo,
    codigo,
    descricaoProduto: `${codigo} - descrição`,
    familia: null,
    status: "novo",
    revisao,
  };
}

function rel(codigoFilho: string, revisao: string): EstruturaRel {
  return {
    numeroPai: "1",
    numeroFilho: "1.1",
    codigoPai: "PAI",
    codigoFilho,
    descricaoFilho: `${codigoFilho} - filho`,
    quantidade: 1,
    origem: "bom",
    revisao,
  };
}

describe("revisões da BOM", () => {
  it("deduplica o mesmo produto/revisão dentro do mesmo envio", () => {
    expect(revisoesDaBOM([item("PAI", "R001"), item("PAI", "R001"), item("FILHO", "R002")])).toEqual([
      { codigo: "PAI", revisao: "R001", descricao: "PAI - descrição", linha: 1 },
      { codigo: "FILHO", revisao: "R002", descricao: "FILHO - descrição", linha: 1 },
    ]);
  });

  it("substitui somente a revisão gerenciada e preserva observação manual", () => {
    expect(observacaoComRevisao("Revisão R000 · corte a laser", "R001")).toBe(
      "Revisão R001 · corte a laser",
    );
    expect(observacaoComRevisao("Revisão R000", undefined)).toBe("");
    expect(observacaoComRevisao("corte a laser", "R001")).toBe("Revisão R001 · corte a laser");
  });

  it("também registra revisão de relação quando o produto duplicado não foi selecionado", () => {
    expect(revisoesDaEntrada([], [rel("FILHO", "R002")])).toEqual([
      { codigo: "FILHO", revisao: "R002", descricao: "FILHO - filho", linha: null },
    ]);
  });
});

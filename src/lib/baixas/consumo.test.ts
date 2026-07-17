import { describe, expect, it } from "vitest";

import { formatarReais, resumoConsumo, type ItemConsumo } from "./consumo";

const ITENS: ItemConsumo[] = [
  { sku: "A", descricao: "Fita", quantidade: 2, valor: 10, op: "OP1", finalidade: "producao" },
  { sku: "A", descricao: "Fita", quantidade: 3, valor: 15, op: "OP2", finalidade: "producao" },
  { sku: "B", descricao: "Cola", quantidade: 1, valor: 50, op: "OP1", finalidade: null },
];

describe("resumoConsumo", () => {
  it("soma o total e agrupa por produto/OP/finalidade (maior valor primeiro)", () => {
    const r = resumoConsumo(ITENS);
    expect(r.totalValor).toBe(75);
    expect(r.totalItens).toBe(3);
    expect(r.porProduto).toEqual([
      { chave: "Cola", quantidade: 1, valor: 50 },
      { chave: "Fita", quantidade: 5, valor: 25 },
    ]);
    expect(r.porOp[0]).toEqual({ chave: "OP1", quantidade: 3, valor: 60 });
    expect(r.porFinalidade.find((g) => g.chave === "(sem finalidade)")).toEqual({
      chave: "(sem finalidade)",
      quantidade: 1,
      valor: 50,
    });
  });

  it("lista vazia zera tudo", () => {
    const r = resumoConsumo([]);
    expect(r.totalValor).toBe(0);
    expect(r.totalItens).toBe(0);
    expect(r.porProduto).toEqual([]);
  });
});

describe("formatarReais", () => {
  it("formata em R$ pt-BR", () => {
    expect(formatarReais(1234.5)).toContain("1.234,50");
  });
});

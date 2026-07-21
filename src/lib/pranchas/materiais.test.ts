import { describe, expect, it } from "vitest";

import type { ItemBom } from "./bom";
import { parseCode } from "./codes";
import { agruparComerciais } from "./materiais";

function item(peca: string, numero: string, quantidade: number, quantidadeEfetiva = quantidade): ItemBom {
  const code = parseCode(peca);
  if (!code) throw new Error(`código inválido no teste: ${peca}`);
  return { code, numero, quantidade, quantidadeEfetiva };
}

// Linhas reais da BOM "CREHI MT005": o mesmo cadeado/corrediça aparece em
// conjuntos diferentes e precisa somar.
const ITENS: ItemBom[] = [
  item("CREHI SM002 I0POL R00 - MECANISMO TRAVA GAVETA", "2", 1),
  item("COMDB P0381 018AC - DOBRADIÇA DE PINO ROCHA 38,1x18 - 01 AC", "2.2", 2),
  item("CREHI SM005 I0POL R00 - COLUNA DA DOBRADIÇA", "5", 1),
  item("COMDB P0381 018AC - DOBRADIÇA DE PINO ROCHA 38,1x18 - 01 AC", "5.2", 2),
  item("COMRT PO00G 48018 - REBITE POP GALVANIZADO Ø4.8x18", "40", 38),
];

describe("agruparComerciais", () => {
  it("soma o mesmo código que aparece em conjuntos diferentes", () => {
    const linhas = agruparComerciais(ITENS);
    const dobradica = linhas.find((l) => l.codigo === "COMDB P0381 018AC");
    expect(dobradica?.unitaria).toBe(4); // 2 no conjunto 2 + 2 no conjunto 5
  });

  it("deixa os desenhos de fora: a lista é de material de compra", () => {
    expect(agruparComerciais(ITENS).map((l) => l.codigo)).toEqual([
      "COMDB P0381 018AC",
      "COMRT PO00G 48018",
    ]);
  });

  it("multiplica pelo número de conjuntos a produzir", () => {
    const linhas = agruparComerciais(ITENS, 10);
    expect(linhas.find((l) => l.codigo === "COMRT PO00G 48018")).toMatchObject({
      unitaria: 38,
      total: 380,
    });
  });

  it("usa a quantidade efetiva, não a da linha", () => {
    // Um comprado com QTD 1 dentro de um conjunto de QTD 2 entra 2 vezes.
    const dentroDeConjuntoDuplo = [item("COMPA PEMEG 04008 - PARAFUSO M4x08", "6.1", 1, 2)];
    expect(agruparComerciais(dentroDeConjuntoDuplo)[0].unitaria).toBe(2);
  });

  it("mantém a descrição do item", () => {
    const linhas = agruparComerciais(ITENS);
    expect(linhas[1].descricao).toBe("REBITE POP GALVANIZADO Ø4.8x18");
  });
});

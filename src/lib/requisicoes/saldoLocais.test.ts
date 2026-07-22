import { describe, expect, it } from "vitest";

import { itensCobertos, localQueCobreTudo, type ItemComSaldo } from "./saldoLocais";

const PADRAO = { codigo: "5702636851" };
const MATERIA_PRIMA = { codigo: "5940905787" };
const LOCACAO = { codigo: "8667075521" };
const LOCAIS = [PADRAO, MATERIA_PRIMA, LOCACAO];

// Caso real da REQ-0011: stretch zerado no padrão e com 168 na matéria-prima.
const STRETCH: ItemComSaldo = {
  quantidade: 16,
  saldos: { "5702636851": 0, "5940905787": 168, "8667075521": 0 },
};

describe("itensCobertos", () => {
  it("conta só os itens com saldo >= a quantidade pedida", () => {
    const itens: ItemComSaldo[] = [
      STRETCH,
      { quantidade: 4, saldos: { "5702636851": 0, "5940905787": 4, "8667075521": 9 } },
    ];
    expect(itensCobertos("5940905787", itens)).toBe(2);
    expect(itensCobertos("8667075521", itens)).toBe(1);
    expect(itensCobertos("5702636851", itens)).toBe(0);
  });

  it("saldo exatamente igual à quantidade conta como coberto", () => {
    expect(itensCobertos("5940905787", [{ quantidade: 4, saldos: { "5940905787": 4 } }])).toBe(1);
  });

  it("local ausente do mapa de saldos vale 0", () => {
    expect(itensCobertos("9999", [STRETCH])).toBe(0);
  });
});

describe("localQueCobreTudo", () => {
  it("acha o local que atende todos os itens", () => {
    expect(localQueCobreTudo(LOCAIS, [STRETCH])).toBe("5940905787");
  });

  it("undefined quando nenhum local sozinho dá conta", () => {
    const itens: ItemComSaldo[] = [
      { quantidade: 5, saldos: { "5940905787": 10, "8667075521": 0 } },
      { quantidade: 5, saldos: { "5940905787": 0, "8667075521": 10 } },
    ];
    expect(localQueCobreTudo(LOCAIS, itens)).toBeUndefined();
  });

  it("undefined sem itens (nada a cobrir)", () => {
    expect(localQueCobreTudo(LOCAIS, [])).toBeUndefined();
  });

  it("respeita a ordem dos locais quando mais de um cobre", () => {
    const item: ItemComSaldo = { quantidade: 1, saldos: { "5702636851": 9, "5940905787": 9 } };
    expect(localQueCobreTudo(LOCAIS, [item])).toBe("5702636851");
  });
});

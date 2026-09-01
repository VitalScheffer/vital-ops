import { describe, expect, it } from "vitest";

import {
  avaliarConversao,
  normalizarUnidade,
  quantidadeNoLegado,
  quantidadeNoNovo,
} from "./conversao";

describe("normalizarUnidade", () => {
  it("resolve as variações tipográficas da mesma unidade", () => {
    expect(normalizarUnidade("m2")).toBe("M²");
    expect(normalizarUnidade("M²")).toBe("M²");
    expect(normalizarUnidade(" mq ")).toBe("M²");
    expect(normalizarUnidade("mt")).toBe("M");
    expect(normalizarUnidade("Kgs")).toBe("KG");
    expect(normalizarUnidade("UND")).toBe("UN");
  });

  it("NÃO iguala unidades que só parecem sinônimas", () => {
    // "PC" e "UN" são usadas como sinônimo na prática, mas casar sozinho aqui
    // trocaria a unidade de uma matéria-prima sem revisão humana.
    expect(normalizarUnidade("PC")).not.toBe(normalizarUnidade("UN"));
  });

  it("unidade ausente vira vazio (que é 'não sei', não 'igual')", () => {
    expect(normalizarUnidade(undefined)).toBe("");
    expect(normalizarUnidade(null)).toBe("");
    expect(normalizarUnidade("   ")).toBe("");
  });
});

describe("avaliarConversao", () => {
  it("unidades iguais movem 1 para 1, sem exigir fator", () => {
    const a = avaliarConversao({ unidadeLegado: "UN", unidadeNovo: "un" });

    expect(a.situacao).toBe("MESMA_UNIDADE");
    expect(a.mesmaUnidade).toBe(true);
    expect(a.exigeFator).toBe(false);
    expect(a.fator).toBe(1);
    expect(a.podeMovimentar).toBe(true);
  });

  it("unidade igual ignora um fator gravado por engano", () => {
    // Fator herdado de uma correção anterior do par multiplicaria material sem
    // motivo. Unidade igual é sempre 1 para 1.
    const a = avaliarConversao({ unidadeLegado: "KG", unidadeNovo: "KG", fator: 7.85 });

    expect(a.fator).toBe(1);
  });

  it("unidades diferentes sem fator NÃO deixam movimentar", () => {
    const a = avaliarConversao({ unidadeLegado: "M²", unidadeNovo: "KG" });

    expect(a.situacao).toBe("FATOR_PENDENTE");
    expect(a.exigeFator).toBe(true);
    expect(a.podeMovimentar).toBe(false);
    expect(a.mensagem).toContain("1 KG");
  });

  it("unidades diferentes com fator liberam a movimentação", () => {
    const a = avaliarConversao({ unidadeLegado: "M²", unidadeNovo: "KG", fator: 0.1416 });

    expect(a.situacao).toBe("COM_FATOR");
    expect(a.fator).toBe(0.1416);
    expect(a.podeMovimentar).toBe(true);
  });

  it("fator zero, negativo ou não numérico conta como ausente", () => {
    for (const fator of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(avaliarConversao({ unidadeLegado: "M²", unidadeNovo: "KG", fator }).situacao).toBe(
        "FATOR_PENDENTE",
      );
    }
  });

  it("faltando a unidade de um lado, não dá nem para comparar", () => {
    const a = avaliarConversao({ unidadeLegado: "", unidadeNovo: "KG" });

    expect(a.situacao).toBe("UNIDADE_DESCONHECIDA");
    expect(a.mesmaUnidade).toBe(false);
    expect(a.podeMovimentar).toBe(false);
  });
});

describe("conversão da quantidade", () => {
  // O caso real: a OP pede 21,66 KG do código novo e quem tem saldo é um
  // cadastro em M².
  const chapa = avaliarConversao({ unidadeLegado: "M²", unidadeNovo: "KG", fator: 0.1416 });

  it("converte o que a OP pede no novo para a unidade do antigo", () => {
    expect(quantidadeNoLegado(21.66, chapa)).toBe(3.0671);
  });

  it("converte o saldo do antigo para a unidade do novo", () => {
    expect(quantidadeNoNovo(3.0671, chapa)).toBe(21.6603);
  });

  it("mesma unidade passa o número intacto", () => {
    const igual = avaliarConversao({ unidadeLegado: "KG", unidadeNovo: "KG" });

    expect(quantidadeNoLegado(263.745, igual)).toBe(263.745);
  });

  it("sem fator devolve null em vez de fingir que converteu", () => {
    // Devolver a mesma quantidade seria a forma mais rápida de mover 21 "kg" de
    // um cadastro que está em metro quadrado.
    const semFator = avaliarConversao({ unidadeLegado: "M²", unidadeNovo: "KG" });

    expect(quantidadeNoLegado(21.66, semFator)).toBeNull();
    expect(quantidadeNoNovo(3, semFator)).toBeNull();
  });

  it("quantidade negativa ou não numérica devolve null", () => {
    expect(quantidadeNoLegado(-1, chapa)).toBeNull();
    expect(quantidadeNoLegado(Number.NaN, chapa)).toBeNull();
  });
});

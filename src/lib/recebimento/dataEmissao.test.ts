import { describe, expect, it } from "vitest";

import { dataEmissaoSaoPaulo, dataEmissaoSaoPauloDoIso, hojeSaoPaulo } from "./dataEmissao";

describe("dataEmissaoSaoPaulo", () => {
  it("mantém a data civil ao sair do servidor UTC para a interface em São Paulo", () => {
    const data = dataEmissaoSaoPaulo("2026-09-11");

    expect(data.toISOString()).toBe("2026-09-11T03:00:00.000Z");
    expect(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(data)).toBe("11/09/2026");
  });

  it("rejeita uma data inexistente sem normaliza-la para outro dia", () => {
    expect(Number.isNaN(dataEmissaoSaoPaulo("2026-02-31").getTime())).toBe(true);
  });
});

describe("dataEmissaoSaoPauloDoIso", () => {
  it("mantem a data civil das notas legadas salvas a meia-noite UTC", () => {
    const data = dataEmissaoSaoPauloDoIso("2026-09-11T00:00:00.000Z");

    expect(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(data)).toBe("11/09/2026");
  });
});

describe("hojeSaoPaulo", () => {
  it("não adianta a data durante as últimas horas do dia em São Paulo", () => {
    expect(hojeSaoPaulo(new Date("2026-09-12T01:30:00.000Z"))).toBe("2026-09-11");
  });
});

import { describe, expect, it } from "vitest";

import { NCM_PADRAO, normalizarNcm } from "./ncm";

describe("normalizarNcm", () => {
  it("mantém um NCM já formatado", () => {
    expect(normalizarNcm("9401.90.00")).toBe("9401.90.00");
  });

  it("formata 8 dígitos sem pontos", () => {
    expect(normalizarNcm("94019000")).toBe("9401.90.00");
  });

  it("ignora espaços e outros separadores, contando só os dígitos", () => {
    expect(normalizarNcm(" 9401-90-00 ")).toBe("9401.90.00");
  });

  it("cai no padrão quando não há 8 dígitos", () => {
    expect(normalizarNcm("999")).toBe(NCM_PADRAO);
    expect(normalizarNcm("")).toBe(NCM_PADRAO);
    expect(normalizarNcm(null)).toBe(NCM_PADRAO);
    expect(normalizarNcm(undefined)).toBe(NCM_PADRAO);
  });

  it("aceita 9999.99.99 se o usuário insistir (8 dígitos válidos de forma)", () => {
    // A tela desencoraja, mas se digitarem, respeitamos a escolha (formato ok).
    expect(normalizarNcm("9999.99.99")).toBe("9999.99.99");
  });
});

import { describe, expect, it } from "vitest";

import { localizarColunas, multiplicarNumero, validarFator } from "./celulas";

describe("células do multiplicador", () => {
  it("encontra QTD e PESO sem confundir peso total", () => {
    expect(localizarColunas(["Nº", "PEÇA", "QTD", "PESO", "PESO TOTAL"])).toEqual({ quantidade: 2, peso: 3 });
  });

  it("multiplica número escrito no padrão brasileiro", () => {
    expect(multiplicarNumero("2,50", 10)).toBe(25);
  });

  it("recusa fator zero", () => {
    expect(() => validarFator(0)).toThrow("maior que zero");
  });
});

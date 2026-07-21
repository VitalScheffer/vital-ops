import { describe, expect, it } from "vitest";

import { estaAberta, mapaJaDesenhado, podeAssumir } from "@/lib/configurador/fila";

describe("estado da configuração na fila", () => {
  it("aberta enquanto não foi respondida", () => {
    expect(estaAberta("ENVIADA")).toBe(true);
    expect(estaAberta("EM_ANALISE")).toBe(true);
    expect(estaAberta("ATENDIDA")).toBe(false);
    expect(estaAberta("RECUSADA")).toBe(false);
  });

  it("assumir só a partir de enviada", () => {
    expect(podeAssumir("ENVIADA")).toBe(true);
    expect(podeAssumir("EM_ANALISE")).toBe(false);
    expect(podeAssumir("ATENDIDA")).toBe(false);
  });
});

describe("mapaJaDesenhado", () => {
  it("indexa a combinação pelo projeto CAD", () => {
    const mapa = mapaJaDesenhado([
      { codigo: "MACA-INOX", numero: 5, projetoCad: "PRJ-900" },
      { codigo: "MACA-CARB", numero: 3, projetoCad: "PRJ-100" },
    ]);
    expect(mapa.get("MACA-INOX")).toEqual({ numero: 5, projetoCad: "PRJ-900" });
    expect(mapa.get("MACA-CARB")?.projetoCad).toBe("PRJ-100");
  });

  it("mantém o mais recente quando a combinação foi atendida mais de uma vez", () => {
    const mapa = mapaJaDesenhado([
      { codigo: "MACA-INOX", numero: 9, projetoCad: "PRJ-NOVO" },
      { codigo: "MACA-INOX", numero: 2, projetoCad: "PRJ-ANTIGO" },
    ]);
    expect(mapa.get("MACA-INOX")?.projetoCad).toBe("PRJ-NOVO");
  });

  it("ignora atendida sem número de projeto", () => {
    const mapa = mapaJaDesenhado([{ codigo: "MACA-INOX", numero: 1, projetoCad: null }]);
    expect(mapa.has("MACA-INOX")).toBe(false);
  });

  it("combinação nunca atendida não entra no índice", () => {
    expect(mapaJaDesenhado([]).get("MACA-INOX")).toBeUndefined();
  });
});

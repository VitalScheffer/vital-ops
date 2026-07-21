import { describe, expect, it } from "vitest";

import {
  estaAberta,
  mapaRespostas,
  podeAssumir,
  temProjetoParaReusar,
  type RegistroRespondido,
} from "@/lib/configurador/fila";

function respondida(parcial: Partial<RegistroRespondido> = {}): RegistroRespondido {
  return {
    codigo: "MACA-INOX",
    numero: 5,
    status: "ATENDIDA",
    projetoCad: "PRJ-900",
    respostaNota: null,
    respondidoPorNome: "Jonathan",
    respondidoQuando: "21/07/2026 14:00",
    ...parcial,
  };
}

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

describe("mapaRespostas", () => {
  it("indexa a resposta pela combinação", () => {
    const mapa = mapaRespostas([
      respondida({ codigo: "MACA-INOX", projetoCad: "PRJ-900", respostaNota: "usa o perfil 40x40" }),
      respondida({ codigo: "MACA-CARB", numero: 3, projetoCad: "PRJ-100" }),
    ]);
    expect(mapa.get("MACA-INOX")).toEqual({
      numero: 5,
      status: "ATENDIDA",
      projetoCad: "PRJ-900",
      nota: "usa o perfil 40x40",
      quem: "Jonathan",
      quando: "21/07/2026 14:00",
    });
    expect(mapa.get("MACA-CARB")?.projetoCad).toBe("PRJ-100");
  });

  it("mantém a resposta mais recente quando a combinação foi respondida mais de uma vez", () => {
    const mapa = mapaRespostas([
      respondida({ numero: 9, projetoCad: "PRJ-NOVO" }),
      respondida({ numero: 2, projetoCad: "PRJ-ANTIGO" }),
    ]);
    expect(mapa.get("MACA-INOX")?.projetoCad).toBe("PRJ-NOVO");
  });

  it("guarda também a recusa, para o vendedor saber o motivo", () => {
    const mapa = mapaRespostas([
      respondida({ status: "RECUSADA", projetoCad: null, respostaNota: "fora de linha" }),
    ]);
    expect(mapa.get("MACA-INOX")?.nota).toBe("fora de linha");
  });

  it("combinação nunca respondida não entra no índice", () => {
    expect(mapaRespostas([]).get("MACA-INOX")).toBeUndefined();
  });
});

describe("temProjetoParaReusar", () => {
  it("só a atendida com número de projeto vale como atalho", () => {
    expect(temProjetoParaReusar(mapaRespostas([respondida()]).get("MACA-INOX"))).toBe(true);
  });

  it("recusada não tem desenho para reaproveitar", () => {
    const mapa = mapaRespostas([respondida({ status: "RECUSADA", projetoCad: null })]);
    expect(temProjetoParaReusar(mapa.get("MACA-INOX"))).toBe(false);
  });

  it("atendida sem número de projeto não serve de atalho", () => {
    const mapa = mapaRespostas([respondida({ projetoCad: null })]);
    expect(temProjetoParaReusar(mapa.get("MACA-INOX"))).toBe(false);
  });

  it("combinação desconhecida", () => {
    expect(temProjetoParaReusar(undefined)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { produtoPorSlug } from "@/lib/configurador/catalogo";
import { escolhasPadrao, montarCodigo, resolverSelecoes } from "@/lib/configurador/codigo";
import { montarHistorico, type RegistroHistorico } from "@/lib/configurador/historico";

const maca = produtoPorSlug("maca-padiola")!;

function selecoesDe(escolhas: Record<string, { opcao: string; texto?: string }>) {
  const resultado = resolverSelecoes(maca, escolhas);
  if (!resultado.ok) throw new Error(resultado.erro);
  return resultado.selecoes;
}

function registro(parcial: Partial<RegistroHistorico> = {}): RegistroHistorico {
  const selecoes = parcial.selecoes ?? selecoesDe(escolhasPadrao(maca));
  return {
    numero: 1,
    codigo: montarCodigo(maca, selecoes as never),
    produtoSlug: "maca-padiola",
    selecoes,
    observacoes: null,
    autorNome: "Rodrigo",
    criadoEm: new Date("2026-07-21T12:00:00Z"),
    ...parcial,
  };
}

describe("montarHistorico", () => {
  it("agrupa envios com a mesma combinação e conta as vezes", () => {
    const itens = montarHistorico(maca, [
      registro({ numero: 3 }),
      registro({ numero: 2 }),
      registro({ numero: 1 }),
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0].vezes).toBe(3);
  });

  it("mantém o envio MAIS RECENTE como representante do grupo", () => {
    const itens = montarHistorico(maca, [
      registro({ numero: 9, observacoes: "a mais nova" }),
      registro({ numero: 1, observacoes: "a antiga" }),
    ]);
    expect(itens[0].numero).toBe(9);
    expect(itens[0].observacoes).toBe("a mais nova");
  });

  it("separa combinações diferentes", () => {
    const inox = selecoesDe({ ...escolhasPadrao(maca), MAT: { opcao: "INOX" } });
    const itens = montarHistorico(maca, [
      registro({ numero: 2, selecoes: inox, codigo: montarCodigo(maca, inox) }),
      registro({ numero: 1 }),
    ]);
    expect(itens).toHaveLength(2);
  });

  it("ignora configuração de outro produto", () => {
    const itens = montarHistorico(maca, [registro({ produtoSlug: "outra-coisa" })]);
    expect(itens).toHaveLength(0);
  });

  it("respeita o limite", () => {
    const registros = Array.from({ length: 10 }, (_, indice) => {
      const selecoes = selecoesDe({
        ...escolhasPadrao(maca),
        PESO: { opcao: "POUT", texto: `${100 + indice} kg` },
      });
      return registro({ numero: indice, selecoes, codigo: montarCodigo(maca, selecoes) });
    });
    expect(montarHistorico(maca, registros, 6)).toHaveLength(6);
  });

  it("traz as escolhas prontas para recarregar o formulário", () => {
    const selecoes = selecoesDe({ ...escolhasPadrao(maca), ROD: { opcao: "R8" } });
    const itens = montarHistorico(maca, [
      registro({ selecoes, codigo: montarCodigo(maca, selecoes) }),
    ]);
    expect(itens[0].escolhas.ROD).toEqual({ opcao: "R8", texto: undefined });
    expect(itens[0].desvios).toEqual(['Rodízios: 8"']);
  });
});

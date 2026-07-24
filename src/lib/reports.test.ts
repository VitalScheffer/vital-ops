import { describe, expect, it } from "vitest";

import {
  contextoErroInicial,
  contextoErroRepetido,
  lerContextoErro,
} from "@/lib/reports";

const QUANDO = new Date("2026-07-24T12:00:00.000Z");

describe("contextoErroInicial", () => {
  it("erro de cliente sem digest guarda só o stack", () => {
    expect(contextoErroInicial({ stack: "TypeError\n  at Foo" })).toEqual({
      ocorrencias: 1,
      stack: "TypeError\n  at Foo",
    });
  });

  it("erro do servidor guarda o digest junto", () => {
    expect(contextoErroInicial({ digest: "123abc", stack: "Error\n  at Bar" })).toEqual({
      ocorrencias: 1,
      digest: "123abc",
      stack: "Error\n  at Bar",
    });
  });

  it("sem stack nem digest, ainda conta a ocorrência", () => {
    expect(contextoErroInicial({})).toEqual({ ocorrencias: 1 });
  });

  it("corta stack gigante para não virar despejo de log no banco", () => {
    const contexto = contextoErroInicial({ stack: "x".repeat(9000) });
    expect(contexto.stack).toHaveLength(4000);
  });
});

describe("lerContextoErro", () => {
  it("report antigo (sem `ocorrencias`) conta como 1", () => {
    expect(lerContextoErro({ digest: "abc" })).toEqual({ ocorrencias: 1, digest: "abc" });
  });

  it("contexto nulo ou de tipo inesperado não quebra", () => {
    expect(lerContextoErro(null)).toEqual({ ocorrencias: 1 });
    expect(lerContextoErro("lixo")).toEqual({ ocorrencias: 1 });
    expect(lerContextoErro([1, 2])).toEqual({ ocorrencias: 1 });
  });

  it("ignora `ocorrencias` inválida em vez de propagar NaN", () => {
    expect(lerContextoErro({ ocorrencias: "muitas" }).ocorrencias).toBe(1);
    expect(lerContextoErro({ ocorrencias: 0 }).ocorrencias).toBe(1);
    expect(lerContextoErro({ ocorrencias: -3 }).ocorrencias).toBe(1);
  });
});

describe("contextoErroRepetido", () => {
  it("soma a ocorrência e marca quando repetiu", () => {
    const anterior = { ocorrencias: 1, stack: "TypeError\n  at Foo" };
    expect(contextoErroRepetido(anterior, { stack: "TypeError\n  at Foo" }, QUANDO)).toEqual({
      ocorrencias: 2,
      stack: "TypeError\n  at Foo",
      ultimaEm: "2026-07-24T12:00:00.000Z",
    });
  });

  it("o episódio inteiro do carro-emergência (6 vezes) vira UM report com contador 6", () => {
    let contexto: unknown = contextoErroInicial({ stack: "TypeError\n  at Configurador" });
    for (let i = 0; i < 5; i += 1) {
      contexto = contextoErroRepetido(contexto, { stack: "TypeError\n  at Configurador" }, QUANDO);
    }
    expect(lerContextoErro(contexto).ocorrencias).toBe(6);
  });

  it("preenche o stack quando o report anterior não tinha (gravado antes desta mudança)", () => {
    const anterior = { ocorrencias: 2 };
    expect(contextoErroRepetido(anterior, { stack: "Error\n  at Baz" }, QUANDO).stack).toBe(
      "Error\n  at Baz",
    );
  });

  it("não sobrescreve o stack do primeiro erro, que é o que interessa", () => {
    const anterior = { ocorrencias: 1, stack: "primeiro" };
    expect(contextoErroRepetido(anterior, { stack: "segundo" }, QUANDO).stack).toBe("primeiro");
  });
});

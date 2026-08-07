import { beforeEach, describe, expect, it } from "vitest";

import { type Janela, limparJanelas, registrarUso } from "@/lib/pcp/janela";

const JANELA: Janela = { limite: 3, janelaMs: 1000 };

describe("registrarUso", () => {
  beforeEach(() => {
    limparJanelas();
  });

  it("permite até o limite e barra o excedente", () => {
    const agora = 1_000_000;
    for (let i = 0; i < JANELA.limite; i += 1) {
      expect(registrarUso("chave", JANELA, agora).permitido).toBe(true);
    }

    const barrado = registrarUso("chave", JANELA, agora);
    expect(barrado.permitido).toBe(false);
    expect(barrado.esperarSegundos).toBe(1);
  });

  it("conta cada chave separadamente", () => {
    const agora = 1_000_000;
    for (let i = 0; i < JANELA.limite + 1; i += 1) {
      registrarUso("uma", JANELA, agora);
    }

    expect(registrarUso("uma", JANELA, agora).permitido).toBe(false);
    expect(registrarUso("outra", JANELA, agora).permitido).toBe(true);
  });

  it("libera de novo quando a janela vira", () => {
    const agora = 1_000_000;
    for (let i = 0; i < JANELA.limite + 1; i += 1) {
      registrarUso("chave", JANELA, agora);
    }
    expect(registrarUso("chave", JANELA, agora).permitido).toBe(false);

    expect(registrarUso("chave", JANELA, agora + JANELA.janelaMs + 1).permitido).toBe(true);
  });
});

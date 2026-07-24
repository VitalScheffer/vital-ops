import { describe, expect, it } from "vitest";

import {
  inicioJanelaFalhas,
  loginBloqueado,
  MAX_FALHAS_LOGIN,
} from "@/lib/loginGuard";

describe("loginBloqueado", () => {
  it("deixa passar quem errou poucas vezes", () => {
    expect(loginBloqueado(0)).toBe(false);
    expect(loginBloqueado(MAX_FALHAS_LOGIN - 1)).toBe(false);
  });

  it("bloqueia ao atingir o teto, não só ao passar dele", () => {
    expect(loginBloqueado(MAX_FALHAS_LOGIN)).toBe(true);
    expect(loginBloqueado(MAX_FALHAS_LOGIN + 40)).toBe(true);
  });
});

describe("inicioJanelaFalhas", () => {
  it("olha 15 minutos para trás", () => {
    const agora = new Date("2026-07-24T12:00:00.000Z");
    expect(inicioJanelaFalhas(agora).toISOString()).toBe("2026-07-24T11:45:00.000Z");
  });

  it("a janela anda com o relógio, então a trava se solta sozinha", () => {
    const antes = inicioJanelaFalhas(new Date("2026-07-24T12:00:00.000Z"));
    const depois = inicioJanelaFalhas(new Date("2026-07-24T12:20:00.000Z"));
    expect(depois.getTime()).toBeGreaterThan(antes.getTime());
  });
});

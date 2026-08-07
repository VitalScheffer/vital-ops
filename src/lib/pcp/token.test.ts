import { describe, expect, it } from "vitest";

import {
  chaveDoToken,
  PCP_TOKEN_MIN_CARACTERES,
  tokenConfere,
  tokenDoHeader,
  tokenEsperado,
} from "@/lib/pcp/token";

const TOKEN = "z".repeat(PCP_TOKEN_MIN_CARACTERES);

describe("tokenEsperado", () => {
  it("trata ausente, vazia e só espaço como ponte desligada", () => {
    expect(tokenEsperado(undefined)).toBeNull();
    expect(tokenEsperado(null)).toBeNull();
    expect(tokenEsperado("")).toBeNull();
    expect(tokenEsperado("   ")).toBeNull();
  });

  it("recusa token curto demais (segredo fraco = ponte desligada)", () => {
    expect(tokenEsperado("a".repeat(PCP_TOKEN_MIN_CARACTERES - 1))).toBeNull();
  });

  it("aceita token com tamanho suficiente, sem os espaços das pontas", () => {
    expect(tokenEsperado(` ${TOKEN} `)).toBe(TOKEN);
  });
});

describe("tokenDoHeader", () => {
  it("extrai o token do esquema Bearer, em qualquer caixa", () => {
    expect(tokenDoHeader(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(tokenDoHeader(`bearer ${TOKEN}`)).toBe(TOKEN);
    expect(tokenDoHeader(`BEARER   ${TOKEN}`)).toBe(TOKEN);
  });

  it("devolve null para header ausente, outro esquema ou malformado", () => {
    expect(tokenDoHeader(null)).toBeNull();
    expect(tokenDoHeader("")).toBeNull();
    expect(tokenDoHeader(TOKEN)).toBeNull();
    expect(tokenDoHeader("Basic dXNlcjpzZW5oYQ==")).toBeNull();
    expect(tokenDoHeader("Bearer")).toBeNull();
    expect(tokenDoHeader("Bearer ")).toBeNull();
  });
});

describe("tokenConfere", () => {
  it("aceita só o token idêntico", () => {
    expect(tokenConfere(TOKEN, TOKEN)).toBe(true);
    expect(tokenConfere(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(tokenConfere(TOKEN.toUpperCase(), TOKEN)).toBe(false);
  });

  it("não lança com comprimentos diferentes (armadilha do timingSafeEqual)", () => {
    expect(() => tokenConfere("a", TOKEN)).not.toThrow();
    expect(tokenConfere("a", TOKEN)).toBe(false);
    expect(tokenConfere("", TOKEN)).toBe(false);
  });
});

describe("chaveDoToken", () => {
  it("é determinística e não contém o token", () => {
    const chave = chaveDoToken(TOKEN);
    expect(chave).toBe(chaveDoToken(TOKEN));
    expect(chave).not.toContain(TOKEN);
    expect(chave).toMatch(/^[0-9a-f]{32}$/);
  });

  it("separa tokens diferentes", () => {
    expect(chaveDoToken(TOKEN)).not.toBe(chaveDoToken(`${TOKEN}x`));
  });
});

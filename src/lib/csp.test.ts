import { describe, expect, it } from "vitest";

import { cspDaPagina, nonceNovo } from "@/lib/csp";

describe("nonceNovo", () => {
  it("nunca repete", () => {
    const gerados = new Set(Array.from({ length: 200 }, () => nonceNovo()));
    expect(gerados.size).toBe(200);
  });

  it("é base64 de 16 bytes", () => {
    expect(nonceNovo()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("cspDaPagina", () => {
  const producao = cspDaPagina("ABC123", false);

  it("leva o nonce no script-src", () => {
    expect(producao).toContain("script-src 'self' 'nonce-ABC123'");
  });

  it("libera WebAssembly, senão o 3D não abre", () => {
    expect(producao).toContain("'wasm-unsafe-eval'");
  });

  it("libera blob: onde as telas realmente usam", () => {
    // worker do meshopt/model-viewer, iframe de impressão das pranchas e as
    // texturas/modelos carregados como blob ou data URI.
    expect(producao).toContain("worker-src 'self' blob:");
    expect(producao).toContain("frame-src 'self' blob:");
    expect(producao).toContain("img-src 'self' data: blob:");
  });

  it("NÃO põe nonce em style-src, senão o unsafe-inline seria ignorado", () => {
    expect(producao).toContain("style-src 'self' 'unsafe-inline'");
    expect(producao).not.toMatch(/style-src[^;]*nonce/);
  });

  it("fecha o que não precisa estar aberto", () => {
    expect(producao).toContain("object-src 'none'");
    expect(producao).toContain("frame-ancestors 'none'");
    expect(producao).toContain("base-uri 'self'");
    expect(producao).toContain("form-action 'self'");
  });

  it("só o modo de desenvolvimento ganha unsafe-eval", () => {
    expect(producao).not.toContain("'unsafe-eval'");
    expect(cspDaPagina("ABC123", true)).toContain("'unsafe-eval'");
  });
});

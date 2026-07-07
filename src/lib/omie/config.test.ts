import { afterEach, describe, expect, it, vi } from "vitest";

// Testa a limpeza do OMIE_BASE_URL. O módulo lê process.env no import, então
// setamos a env var e reimportamos com módulos isolados a cada caso.
async function baseUrlCom(valor: string | undefined): Promise<string> {
  vi.resetModules();
  if (valor === undefined) delete process.env.OMIE_BASE_URL;
  else process.env.OMIE_BASE_URL = valor;
  const mod = await import("./config");
  return mod.OMIE_BASE_URL;
}

describe("OMIE_BASE_URL — limpeza defensiva", () => {
  afterEach(() => {
    delete process.env.OMIE_BASE_URL;
  });

  it("mantém uma URL limpa (só tira a barra final)", async () => {
    expect(await baseUrlCom("https://app.omie.com.br/api/v1/")).toBe(
      "https://app.omie.com.br/api/v1",
    );
  });

  it("remove aspas acidentais em volta do valor", async () => {
    expect(await baseUrlCom('"https://app.omie.com.br/api/v1"')).toBe(
      "https://app.omie.com.br/api/v1",
    );
  });

  it("remove BOM invisível no começo (causa do 'Failed to parse URL')", async () => {
    expect(await baseUrlCom("\uFEFFhttps://app.omie.com.br/api/v1")).toBe(
      "https://app.omie.com.br/api/v1",
    );
  });

  it("remove espaços/quebras de linha nas pontas", async () => {
    expect(await baseUrlCom("  https://app.omie.com.br/api/v1\n")).toBe(
      "https://app.omie.com.br/api/v1",
    );
  });

  it("cai no padrão quando a env var não existe", async () => {
    expect(await baseUrlCom(undefined)).toBe("https://app.omie.com.br/api/v1");
  });
});

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

describe("omieCredentials — limpeza das chaves", () => {
  afterEach(() => {
    delete process.env.OMIE_APP_KEY;
    delete process.env.OMIE_APP_SECRET;
  });

  it("remove aspas das credenciais (causa do 'chave de acesso inválida')", async () => {
    vi.resetModules();
    process.env.OMIE_APP_KEY = '"minha-chave"';
    process.env.OMIE_APP_SECRET = '"meu-segredo"';
    const { omieCredentials } = await import("./config");
    expect(omieCredentials()).toEqual({ appKey: "minha-chave", appSecret: "meu-segredo" });
  });

  it("lança erro claro quando a chave fica vazia", async () => {
    vi.resetModules();
    process.env.OMIE_APP_KEY = '""';
    process.env.OMIE_APP_SECRET = "algo";
    const { omieCredentials } = await import("./config");
    expect(() => omieCredentials()).toThrow(/não configurados/i);
  });
});

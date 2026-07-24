import { describe, expect, it } from "vitest";

import { entregaDeAnexo, mimeDeAnexoPermitido } from "@/lib/anexos";

describe("mimeDeAnexoPermitido", () => {
  it("aceita o que a equipe realmente anexa (print e planilha)", () => {
    // Os anexos que existiam no banco quando a regra foi escrita: png, jpeg e xls.
    expect(mimeDeAnexoPermitido("image/png")).toBe(true);
    expect(mimeDeAnexoPermitido("image/jpeg")).toBe(true);
    expect(mimeDeAnexoPermitido("application/vnd.ms-excel")).toBe(true);
  });

  it("aceita arquivo sem tipo detectado (o navegador manda octet-stream)", () => {
    expect(mimeDeAnexoPermitido("application/octet-stream")).toBe(true);
  });

  it("RECUSA SVG, que é imagem que executa script", () => {
    expect(mimeDeAnexoPermitido("image/svg+xml")).toBe(false);
  });

  it("RECUSA HTML e afins", () => {
    expect(mimeDeAnexoPermitido("text/html")).toBe(false);
    expect(mimeDeAnexoPermitido("application/xhtml+xml")).toBe(false);
    expect(mimeDeAnexoPermitido("image/svg+xml; charset=utf-8")).toBe(false);
    expect(mimeDeAnexoPermitido("text/javascript")).toBe(false);
  });
});

describe("entregaDeAnexo", () => {
  it("imagem de pixel abre na aba", () => {
    expect(entregaDeAnexo("image/png")).toEqual({
      contentType: "image/png",
      disposition: "inline",
    });
  });

  it("planilha e PDF sempre baixam, nunca abrem", () => {
    expect(entregaDeAnexo("application/pdf").disposition).toBe("attachment");
    expect(entregaDeAnexo("application/vnd.ms-excel").disposition).toBe("attachment");
  });

  it("anexo antigo com MIME perigoso vira download de bytes opacos", () => {
    // Registro gravado antes da allowlist: o Content-Type NÃO pode voltar como
    // veio, senão a correção só valeria para anexo novo.
    expect(entregaDeAnexo("image/svg+xml")).toEqual({
      contentType: "application/octet-stream",
      disposition: "attachment",
    });
    expect(entregaDeAnexo("text/html")).toEqual({
      contentType: "application/octet-stream",
      disposition: "attachment",
    });
  });

  it("MIME vazio ou lixo não vira Content-Type", () => {
    expect(entregaDeAnexo("").contentType).toBe("application/octet-stream");
    expect(entregaDeAnexo("nao/existe").contentType).toBe("application/octet-stream");
  });
});

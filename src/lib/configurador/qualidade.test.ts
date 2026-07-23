import { describe, expect, it } from "vitest";

import { ehQualidade, QUALIDADES, qualidadeDaUrl } from "@/lib/configurador/qualidade";

describe("qualidade", () => {
  it("tem os três níveis, na ordem do mais leve ao mais pesado", () => {
    expect(QUALIDADES.map((q) => q.chave)).toEqual(["padrao", "alta", "maxima"]);
  });

  it("reconhece só os níveis válidos", () => {
    expect(ehQualidade("alta")).toBe(true);
    expect(ehQualidade("ultra")).toBe(false);
    expect(ehQualidade(undefined)).toBe(false);
  });

  it("cai no padrão quando a URL traz coisa inválida, lista ou nada", () => {
    expect(qualidadeDaUrl("maxima")).toBe("maxima");
    expect(qualidadeDaUrl(["alta", "x"])).toBe("alta");
    expect(qualidadeDaUrl("ultra")).toBe("padrao");
    expect(qualidadeDaUrl(undefined)).toBe("padrao");
    expect(qualidadeDaUrl(null)).toBe("padrao");
  });
});

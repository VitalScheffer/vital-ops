import { describe, expect, it } from "vitest";

import { indexarCatalogo } from "@/lib/produtos/materiaPrima";
import { montarFila, sugerirEquivalente, type ItemLegado } from "./depara";
import { ehCodigoNovo } from "./legado";

// Catálogo MAT recortado do Omie real (28/08/2026).
const CATALOGO = indexarCatalogo([
  { codigo: "MATCH 00060 IN430", descricao: "MATCH 00060 IN430 - CHAPA ESP 0,60 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00090 IN430", descricao: "MATCH 00090 IN430 - CHAPA ESP 0,90 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00200 AC012", descricao: "MATCH 00200 AC012 - CHAPA ESP 2,00 AÇO CARBONO 1020 (1200x2000)", unidade: "KG" },
  {
    codigo: "MATTB RD190 12I43",
    descricao: "MATTB RD190 12I43 - TUBO REDONDO Ø19,05x1,2 AÇO INOX POLIDO 430 (6000mm)",
    unidade: "KG",
  },
]);

function legado(descricao: string, unidade = "M²", codigo = "PRD00620"): ItemLegado {
  return { codigo, descricao, unidade };
}

describe("sugerirEquivalente", () => {
  it("casa chapa pela espessura e pela liga", () => {
    const s = sugerirEquivalente(legado("CHAPA 0,60 X 1200 X 2000 MM ACO INOX 430", "KG"), CATALOGO);

    expect(s.codigoNovo).toBe("MATCH 00060 IN430");
    expect(s.confianca).toBe("EXATA");
    expect(s.alertas).toEqual([]);
    expect(s.unidadeMuda).toBe(false);
  });

  it("avisa quando a descrição antiga diz uma série de inox que o catálogo novo não tem", () => {
    // Este é o caso real do PRD00620: geometria idêntica, liga escrita como
    // "INOX 200". A geometria casa, mas a linha NÃO pode sair como exata.
    const s = sugerirEquivalente(legado("CHAPA 0,90 X 1200 X 2000 MM ACO INOX 200", "M²"), CATALOGO);

    expect(s.codigoNovo).toBe("MATCH 00090 IN430");
    expect(s.confianca).toBe("APROXIMADA");
    expect(s.alertas.some((a) => a.includes("inox 200"))).toBe(true);
  });

  it("avisa quando a unidade muda (M² para KG o saldo não se converte sozinho)", () => {
    const s = sugerirEquivalente(legado("CHAPA 0,60 X 1200 X 2000 MM ACO INOX 430", "M²"), CATALOGO);

    expect(s.unidadeMuda).toBe(true);
    expect(s.alertas.some((a) => a.includes("M²") && a.includes("KG"))).toBe(true);
    expect(s.confianca).toBe("APROXIMADA");
  });

  it("casa tubo redondo pelo diâmetro e pela parede", () => {
    const s = sugerirEquivalente(
      legado("TUBO REDONDO 19,05 X 1,20 MM ACO INOX 430", "KG", "PRD00701"),
      CATALOGO,
    );
    expect(s.codigoNovo).toBe("MATTB RD190 12I43");
  });

  it("não sugere nada quando a descrição não é matéria-prima", () => {
    const s = sugerirEquivalente(legado("CANETA ESFEROGRAFICA AZUL", "UN", "PRD00016"), CATALOGO);

    expect(s.codigoNovo).toBeUndefined();
    expect(s.confianca).toBe("SEM_SUGESTAO");
    expect(s.motivo).toContain("forma e medida");
  });

  it("não inventa equivalente quando a bitola não existe no catálogo", () => {
    const s = sugerirEquivalente(legado("CHAPA 12,00 X 1200 X 2000 MM ACO INOX 430", "KG"), CATALOGO);

    expect(s.codigoNovo).toBeUndefined();
    expect(s.confianca).toBe("SEM_SUGESTAO");
    expect(s.motivo).toContain("Nenhum cadastro MAT");
  });

  it("respeita a liga: chapa de carbono não vira chapa de inox", () => {
    const s = sugerirEquivalente(legado("CHAPA 2,00 X 1200 X 2000 MM ACO CARBONO 1020", "KG"), CATALOGO);
    expect(s.codigoNovo).toBe("MATCH 00200 AC012");
  });
});

describe("montarFila", () => {
  it("ordena por saldo decrescente (quem tem material parado vem primeiro)", () => {
    const fila = montarFila(
      [
        { codigo: "PRD00001", descricao: "CHAPA 0,60 X 1200 X 2000 MM ACO INOX 430", saldo: 3 },
        { codigo: "PRD00002", descricao: "CHAPA 0,90 X 1200 X 2000 MM ACO INOX 430", saldo: 480 },
        { codigo: "PRD00003", descricao: "CHAPA 2,00 X 1200 X 2000 MM ACO CARBONO 1020", saldo: 51 },
      ],
      CATALOGO,
    );

    expect(fila.map((l) => l.codigo)).toEqual(["PRD00002", "PRD00003", "PRD00001"]);
    expect(fila[0].sugestao.codigoNovo).toBe("MATCH 00090 IN430");
  });
});

describe("ehCodigoNovo", () => {
  it("reconhece o padrão novo 5-5-5, não só o prefixo MAT", () => {
    expect(ehCodigoNovo("MATCH 00060 IN430")).toBe(true);
    expect(ehCodigoNovo("COMDB P0381 018AC")).toBe(true);
    // Submontagem e peça também são código novo: não entram na fila.
    expect(ehCodigoNovo("CREHS SM001 I0POL")).toBe(true);
    expect(ehCodigoNovo("CREHI PC002 CCPTD")).toBe(true);
  });

  it("código legado fica de fora do filtro (é o que a fila procura)", () => {
    expect(ehCodigoNovo("PRD00620")).toBe(false);
    expect(ehCodigoNovo("PRD02564")).toBe(false);
  });
});

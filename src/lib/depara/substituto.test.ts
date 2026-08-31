import { describe, expect, it } from "vitest";

import { indexarCatalogo } from "@/lib/produtos/materiaPrima";
import { anotarUnidades, indexarSubstitutos, type LegadoComSaldo } from "./substituto";

const CATALOGO = indexarCatalogo([
  { codigo: "MATCH 00060 IN430", descricao: "MATCH 00060 IN430 - CHAPA ESP 0,60 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00090 IN430", descricao: "MATCH 00090 IN430 - CHAPA ESP 0,90 AÇO INOX 430 (1200x2000)", unidade: "KG" },
]);

function legado(codigo: string, descricao: string, saldo: number, unidade?: string): LegadoComSaldo {
  return { codigo, idProd: `id-${codigo}`, descricao, saldo, unidade };
}

const CHAPA_060 = "CHAPA 0,60 X 1200 X 2000 MM ACO INOX 430";
const CHAPA_090 = "CHAPA 0,90 X 1200 X 2000 MM ACO INOX 430";

describe("indexarSubstitutos", () => {
  it("indexa pelo código NOVO, que é o que a OP pede", () => {
    const indice = indexarSubstitutos([legado("PRD00620", CHAPA_090, 240)], CATALOGO, []);

    expect([...indice.keys()]).toEqual(["MATCH 00090 IN430"]);
    expect(indice.get("MATCH 00090 IN430")?.[0]).toMatchObject({
      codigo: "PRD00620",
      saldo: 240,
      origem: "automatico",
    });
  });

  it("o De/Para confirmado tem prioridade e não carrega o aviso de deduzido", () => {
    const indice = indexarSubstitutos(
      [legado("PRD00777", CHAPA_090, 240)],
      CATALOGO,
      [{ codigoLegado: "PRD00777", codigoNovo: "MATCH 00090 IN430" }],
    );

    const achado = indice.get("MATCH 00090 IN430")?.[0];
    expect(achado?.origem).toBe("confirmado");
    expect(achado?.avisos).toEqual([]);
  });

  it("confirmado vem ANTES de automático, mesmo com menos saldo", () => {
    const indice = indexarSubstitutos(
      [legado("PRD00001", CHAPA_090, 5000), legado("PRD00002", CHAPA_090, 3)],
      CATALOGO,
      [{ codigoLegado: "PRD00002", codigoNovo: "MATCH 00090 IN430" }],
    );

    const lista = indice.get("MATCH 00090 IN430") ?? [];
    expect(lista.map((s) => s.codigo)).toEqual(["PRD00002", "PRD00001"]);
  });

  it("entre automáticos, o de maior saldo vem primeiro", () => {
    const indice = indexarSubstitutos(
      [legado("PRD00001", CHAPA_060, 12), legado("PRD00002", CHAPA_060, 900)],
      CATALOGO,
      [],
    );
    expect((indice.get("MATCH 00060 IN430") ?? []).map((s) => s.codigo)).toEqual(["PRD00002", "PRD00001"]);
  });

  it("ignora legado sem saldo (não adianta oferecer o que não tem material)", () => {
    const indice = indexarSubstitutos([legado("PRD00620", CHAPA_090, 0)], CATALOGO, []);
    expect(indice.size).toBe(0);
  });

  it("legado que não casa com nada fica de fora", () => {
    const indice = indexarSubstitutos([legado("PRD00016", "CANETA ESFEROGRAFICA AZUL", 50)], CATALOGO, []);
    expect(indice.size).toBe(0);
  });

  it("o automático avisa que ninguém revisou o par", () => {
    const indice = indexarSubstitutos([legado("PRD00620", CHAPA_090, 240)], CATALOGO, []);
    const avisos = indice.get("MATCH 00090 IN430")?.[0].avisos ?? [];
    expect(avisos.some((a) => a.includes("Ninguém revisou"))).toBe(true);
  });
});

describe("anotarUnidades", () => {
  const base = indexarSubstitutos([legado("PRD00620", CHAPA_090, 240, "M²")], CATALOGO, []);
  const candidatos = base.get("MATCH 00090 IN430") ?? [];

  it("marca a mudança de unidade e explica que a quantidade não se converte", () => {
    const [anotado] = anotarUnidades(candidatos, "KG");

    expect(anotado.unidadeMuda).toBe(true);
    expect(anotado.avisos[0]).toContain("KG");
    expect(anotado.avisos[0]).toContain("M²");
    expect(anotado.avisos[0]).toContain("NÃO se converte");
  });

  it("mesma unidade não vira aviso", () => {
    const iguais = indexarSubstitutos([legado("PRD00620", CHAPA_090, 240, "KG")], CATALOGO, []);
    const [anotado] = anotarUnidades(iguais.get("MATCH 00090 IN430") ?? [], "KG");

    expect(anotado.unidadeMuda).toBe(false);
    expect(anotado.avisos.some((a) => a.includes("não se converte"))).toBe(false);
  });

  it("unidade desconhecida de um dos lados não inventa aviso", () => {
    const semUnidade = indexarSubstitutos([legado("PRD00620", CHAPA_090, 240)], CATALOGO, []);
    const [anotado] = anotarUnidades(semUnidade.get("MATCH 00090 IN430") ?? [], "KG");
    expect(anotado.unidadeMuda).toBe(false);
  });
});

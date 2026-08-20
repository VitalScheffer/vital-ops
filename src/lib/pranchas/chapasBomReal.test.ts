import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { indexarCatalogo } from "@/lib/produtos/materiaPrima";

import { lerCodigosDoBom } from "./bom";
import { agruparMateriaPrima } from "./chapas";

// BOM real do carro de emergência CREHI MT003, com o recorte do catálogo MAT do
// Omie que ela usa (leitura de 20/08/2026). É o caso que motivou o Modo 2: uma
// BOM quase toda de chapa, com quatro materiais diferentes e duas medidas de
// chapa inteira.
const BYTES = readFileSync(fileURLToPath(new URL("../bom/__fixtures__/bom-crehi-mt003.xls", import.meta.url)));

const CATALOGO = indexarCatalogo([
  { codigo: "MATCH 00060 AC012", descricao: "MATCH 00060 AC012 - CHAPA ESP 0,60 AÇO CARBONO 1020 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00090 AC012", descricao: "MATCH 00090 AC012 - CHAPA ESP 0,90 AÇO CARBONO 1020 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00120 AC012", descricao: "MATCH 00120 AC012 - CHAPA 1.2 AÇO CARBONO 1200 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00150 AC012", descricao: "MATCH 00150 AC012 - CHAPA 1.5 AÇO CARBONO 1200 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00200 AC012", descricao: "MATCH 00200 AC012 - CHAPA ESP 2,00 AÇO CARBONO 1020 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00090 IN430", descricao: "MATCH 00090 IN430 - CHAPA 0,9 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00200 PEB00", descricao: "MATCH 00200 PEB00 - CHAPA ESP 2,00 PVC EXPANDIDO BRANCO (1000x2000)", unidade: "KG" },
  { codigo: "MATCH 00600 ARB00", descricao: "MATCH 00600 ARB00 - CHAPA 6,0 ACRILICO BRANCO (1000x2000)", unidade: "KG" },
  { codigo: "MATTB RD159 12I43", descricao: "MATTB RD159 12I43 - TUBO REDONDO Ø15,9x1,2 AÇO INOX 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTB RD191 15I43", descricao: "MATTB RD191 15I43 - TUBO REDONDO Ø19,1x1,5 AÇO INOX 430 (6000mm)", unidade: "KG" },
]);

async function linhasDaBomReal(multiplicador: number, aproveitamento = 1) {
  const conteudo = await lerCodigosDoBom(new File([BYTES.slice()], "CREHI MT003 - BOM.xls"));
  return agruparMateriaPrima(conteudo.itens, CATALOGO, {
    unidadePeso: "g",
    multiplicador,
    aproveitamento,
  });
}

describe("matéria-prima da BOM real CREHI MT003", () => {
  it("soma a chapa de 0,6 de todas as peças que a usam", async () => {
    const linha = (await linhasDaBomReal(1)).find((l) => l.codigoMat === "MATCH 00060 AC012");
    // 7 peças de chapa 0,6 (uma delas x2 e duas x4), conferido linha a linha.
    expect(linha?.pecas).toHaveLength(7);
    expect(linha?.quantidade).toBeCloseTo(15.672, 2);
    expect(linha?.areaM2).toBeCloseTo(3.327, 2);
    expect(linha?.chapas).toBe(2);
  });

  it("multiplica o lote inteiro: 10 conjuntos pedem 14 chapas de 0,6", async () => {
    const linha = (await linhasDaBomReal(10)).find((l) => l.codigoMat === "MATCH 00060 AC012");
    expect(linha?.areaM2).toBeCloseTo(33.27, 1);
    expect(linha?.chapas).toBe(14); // 33,27 / 2,4 = 13,9
  });

  it("aplica o aproveitamento informado na tela", async () => {
    const linha = (await linhasDaBomReal(10, 0.8)).find((l) => l.codigoMat === "MATCH 00060 AC012");
    expect(linha?.chapas).toBe(18); // 33,27 / (2,4 × 0,8) = 17,3
  });

  it("separa inox de carbono na mesma espessura", async () => {
    const linhas = await linhasDaBomReal(1);
    expect(linhas.find((l) => l.codigoMat === "MATCH 00090 IN430")?.quantidade).toBeCloseTo(1.46, 2);
    expect(linhas.find((l) => l.codigoMat === "MATCH 00090 AC012")?.quantidade).toBeCloseTo(2.547, 2);
  });

  it("resolve as divisórias de PVC e avisa que a densidade é estimada", async () => {
    const linha = (await linhasDaBomReal(1)).find((l) => l.codigoMat === "MATCH 00200 PEB00");
    expect(linha?.pecas).toEqual(["CREHI PC005 VCCSR", "CREHI PC006 VCCSR"]);
    expect(linha?.quantidade).toBeCloseTo(0.896, 3);
    expect(linha?.densidadeConfirmada).toBe(false);
    expect(linha?.chapas).toBe(1);
  });

  it("lista o tubo em quilo, sem inventar metro quadrado", async () => {
    const linha = (await linhasDaBomReal(1)).find((l) => l.codigoMat === "MATTB RD159 12I43");
    expect(linha?.quantidade).toBeGreaterThan(0);
    expect(linha?.areaM2).toBeNull();
  });

  it("mostra com motivo a peça sem especificação (a tábua de massagem)", async () => {
    const semMp = (await linhasDaBomReal(1)).filter((l) => l.codigoMat === "");
    expect(semMp.some((l) => l.pecas.includes("CREHI PC007 ACFRS"))).toBe(true);
    expect(semMp.every((l) => l.motivo)).toBe(true);
  });
});

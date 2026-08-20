import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import type { ItemCom } from "@/lib/produtos/catalogoCom";

import type { ItemBom } from "./bom";
import { parseCode } from "./codes";
import type { LinhaMateriaPrima } from "./chapas";
import { agruparComerciais, gerarPlanilhaMateriais } from "./materiais";

function item(peca: string, numero: string, quantidade: number, quantidadeEfetiva = quantidade): ItemBom {
  const code = parseCode(peca);
  if (!code) throw new Error(`código inválido no teste: ${peca}`);
  // Comprado não tem peso nem especificação de matéria-prima na BOM.
  return { code, numero, quantidade, quantidadeEfetiva, peso: null, especificacao: "" };
}

// Linhas reais da BOM "CREHI MT005": o mesmo cadeado/corrediça aparece em
// conjuntos diferentes e precisa somar.
const ITENS: ItemBom[] = [
  item("CREHI SM002 I0POL R00 - MECANISMO TRAVA GAVETA", "2", 1),
  item("COMDB P0381 018AC - DOBRADIÇA DE PINO ROCHA 38,1x18 - 01 AC", "2.2", 2),
  item("CREHI SM005 I0POL R00 - COLUNA DA DOBRADIÇA", "5", 1),
  item("COMDB P0381 018AC - DOBRADIÇA DE PINO ROCHA 38,1x18 - 01 AC", "5.2", 2),
  item("COMRT PO00G 48018 - REBITE POP GALVANIZADO Ø4.8x18", "40", 38),
];

describe("agruparComerciais", () => {
  it("soma o mesmo código que aparece em conjuntos diferentes", () => {
    const linhas = agruparComerciais(ITENS);
    const dobradica = linhas.find((l) => l.codigo === "COMDB P0381 018AC");
    expect(dobradica?.unitaria).toBe(4); // 2 no conjunto 2 + 2 no conjunto 5
  });

  it("deixa os desenhos de fora: a lista é de material de compra", () => {
    expect(agruparComerciais(ITENS).map((l) => l.codigo)).toEqual([
      "COMDB P0381 018AC",
      "COMRT PO00G 48018",
    ]);
  });

  it("multiplica pelo número de conjuntos a produzir", () => {
    const linhas = agruparComerciais(ITENS, 10);
    expect(linhas.find((l) => l.codigo === "COMRT PO00G 48018")).toMatchObject({
      unitaria: 38,
      total: 380,
    });
  });

  it("usa a quantidade efetiva, não a da linha", () => {
    // Um comprado com QTD 1 dentro de um conjunto de QTD 2 entra 2 vezes.
    const dentroDeConjuntoDuplo = [item("COMPA PEMEG 04008 - PARAFUSO M4x08", "6.1", 1, 2)];
    expect(agruparComerciais(dentroDeConjuntoDuplo)[0].unitaria).toBe(2);
  });

  it("mantém a descrição do item", () => {
    const linhas = agruparComerciais(ITENS);
    expect(linhas[1].descricao).toBe("REBITE POP GALVANIZADO Ø4.8x18");
  });
});

// Catálogo do Omie no formato que a leitura devolve (chave sem espaços).
const CATALOGO_COM = new Map<string, ItemCom>([
  [
    "COMDBP0381018AC",
    { codigo: "COMDB P0381 018AC", descricao: "DOBRADIÇA DE PINO ROCHA 38,1x18", unidade: "UN" },
  ],
]);

describe("agruparComerciais com o catálogo do Omie", () => {
  it("traz a unidade do cadastro", () => {
    const linhas = agruparComerciais(ITENS, 1, CATALOGO_COM);
    expect(linhas.find((l) => l.codigo === "COMDB P0381 018AC")?.unidade).toBe("UN");
  });

  it("marca o que não está cadastrado no Omie, em vez de assumir uma unidade", () => {
    const rebite = agruparComerciais(ITENS, 1, CATALOGO_COM).find(
      (l) => l.codigo === "COMRT PO00G 48018",
    );
    expect(rebite?.noOmie).toBe(false);
    expect(rebite?.unidade).toBe("");
  });

  it("com o catálogo INCOMPLETO não afirma que o código está fora do Omie", () => {
    const rebite = agruparComerciais(ITENS, 1, CATALOGO_COM, false).find(
      (l) => l.codigo === "COMRT PO00G 48018",
    );
    // Não achado num catálogo truncado é "não sei", não "não existe".
    expect(rebite?.noOmie).toBeUndefined();
    // Quem veio na leitura continua confirmado.
    expect(
      agruparComerciais(ITENS, 1, CATALOGO_COM, false).find((l) => l.codigo === "COMDB P0381 018AC")
        ?.noOmie,
    ).toBe(true);
  });

  it("sem catálogo, nada muda: é o modo que já existia", () => {
    const linhas = agruparComerciais(ITENS, 1);
    expect(linhas.every((l) => l.unidade === undefined && l.noOmie === undefined)).toBe(true);
  });
});

const MP_CHAPA: LinhaMateriaPrima = {
  id: "MATCH 00060 AC012",
  codigoMat: "MATCH 00060 AC012",
  descricaoMat: "MATCH 00060 AC012 - CHAPA ESP 0,60 AÇO CARBONO 1020 (1200x2000)",
  unidade: "KG",
  quantidade: 15.672,
  areaM2: 3.327,
  chapas: 2,
  medida: { larguraMm: 1200, comprimentoMm: 2000, areaM2: 2.4 },
  densidade: 7850,
  densidadeConfirmada: true,
  pecas: ["CREHI PC012 CCSLD", "CREHI PC008 CCPTD"],
};

async function abas(blob: Blob): Promise<XLSX.WorkBook> {
  return XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
}

describe("gerarPlanilhaMateriais", () => {
  it("no modo clássico tem uma aba só, como antes", async () => {
    const wb = await abas(gerarPlanilhaMateriais(agruparComerciais(ITENS, 2), 2, "CREHI MT003"));
    expect(wb.SheetNames).toEqual(["Materiais"]);
  });

  it("no Modo 2 leva a matéria-prima numa aba própria, com m² e chapas", async () => {
    const wb = await abas(
      gerarPlanilhaMateriais(agruparComerciais(ITENS, 2, CATALOGO_COM), 2, "CREHI MT003", {
        materiaPrima: [MP_CHAPA],
        aproveitamento: 0.8,
      }),
    );
    expect(wb.SheetNames).toEqual(["Materiais", "Matéria-prima"]);
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Matéria-prima"], { header: 1 });
    const chapa = linhas.find((l) => l[0] === "MATCH 00060 AC012");
    expect(chapa?.slice(2, 6)).toEqual(["KG", 15.672, 3.327, 2]);
    expect(chapa?.[6]).toBe("1200x2000");
  });
});

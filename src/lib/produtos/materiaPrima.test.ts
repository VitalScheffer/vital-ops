import { describe, expect, it } from "vitest";

import {
  casarMateriaPrima,
  indexarCatalogo,
  lerEspecificacao,
  pesoParaKg,
  pistaDoCodigoPeca,
  type ProdutoMatBruto,
} from "./materiaPrima";

// Recorte REAL do catálogo MAT do Omie (consultado em 10/08/2026), incluindo os
// casos chatos: o mesmo perfil em inox e em carbono, o cadastro com liga
// contraditória entre código e descrição, e as bitolas em polegada.
const CATALOGO_BRUTO: ProdutoMatBruto[] = [
  { codigo: "MATCH 00090 IN430", descricao: "MATCH 00090 IN430 - CHAPA 0,9 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00090 AC012", descricao: "MATCH 00090 AC012 - CHAPA ESP 0,90 AÇO CARBONO 1020 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00120 IN430", descricao: "MATCH 00120 IN430 - CHAPA 1,2 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00150 IN430", descricao: "MATCH 00150 IN430 - CHAPA 1.5 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00200 IN430", descricao: "MATCH 00200 IN430 - CHAPA 2,0 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00300 IN430", descricao: "MATCH 00300 IN430 - CHAPA ESP 3,00 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00200 ARB00", descricao: "MATCH 00200 ARB00 - CHAPA 2,0 ACRILICO BRANCO (1000x2000)", unidade: "KG" },
  { codigo: "MATTB Q2525 12I43", descricao: "MATTB Q2525 12I43 -  TUBO QUADRADO 25x25x1.2 AÇO INOX POLIDO 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTB Q3030 12I43", descricao: "MATTB Q3030 12I43 - TUBO QUADRADO 30x30x1.2 AÇO INOX 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTB Q2020 12C12", descricao: "MATTB Q2020 12C12 - TUBO QUADRADO 20x20x1.2 AÇO CARBONO 1020 (6000mm)", unidade: "KG" },
  { codigo: "MATTB R5030 12C12", descricao: "MATTB R5030 12C12 - TUBO RETANGULAR 50X30 1.2 AÇO SAE 1020", unidade: "KG" },
  { codigo: "MATTB RD158 12I43", descricao: "MATTB RD158 12I43 - TUBO REDONDO Ø15,88x1,2 AÇO INOX POLIDO 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTB RD190 12I43", descricao: "MATTB RD190 12I43 - TUBO REDONDO Ø19,05x1,2 AÇO INOX  POLIDO 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTB RD190 15I43", descricao: "MATTB RD190 15I43 - TUBO REDONDO Ø19,05x1,5 AÇO INOX 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTB RD190 15C12", descricao: "MATTB RD190 15C12 - TUBO REDONDO Ø19,05x1,5 AÇO CARBONO 1020 (6000mm)", unidade: "KG" },
  // Cadastro com liga contraditória: o código diz carbono (C12), a descrição diz inox.
  { codigo: "MATTB RD127 12C12", descricao: "MATTB RD127 12C12 - TUBO REDONDO Ø12,70x1,2 AÇO INOX 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTF RD318 00I43", descricao: "MATTF RD318 00I43 - TREFILADO REDONDO 3,18 AÇO INOX 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTF RD476 00I43", descricao: "MATTF RD476 00I43 - TREFILADO REDONDO Ø4,76 AÇO INOX 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTF RD635 00I43", descricao: "MATTF RD635 00I43 - TREFILADO REDONDO 6,35 AÇO INOX 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTF RD002 AC012", descricao: "MATTF RD002 AC012 - TREFILADO REDONDO 2 POL AÇO SAE 1020", unidade: "KG" },
  { codigo: "MATTF SX058 AC012", descricao: "MATTF SX058 AC012 - TREFILADO SEXTAVADO 5/8 POL AÇO CARBONO 1020 (6000mm)", unidade: "KG" },
  { codigo: "MATPF RA019 BR40P", descricao: "MATPF RA019 BR40P - PERFIL REDONDO ABERTO Ø19,05x4,0 BORRACHA LISA PRETO", unidade: "M" },
];

const CATALOGO = indexarCatalogo(CATALOGO_BRUTO);

function casar(codigoPeca: string, especTexto: string) {
  const espec = lerEspecificacao(especTexto);
  if (!espec) return null;
  return casarMateriaPrima(espec, pistaDoCodigoPeca(codigoPeca), CATALOGO);
}

describe("pistaDoCodigoPeca", () => {
  it("lê material e forma dos 2 primeiros caracteres do 3º bloco", () => {
    expect(pistaDoCodigoPeca("MSVCH PC001 ITSLD")).toEqual({
      liga: "INOX430",
      formas: ["tubo-quadrado", "tubo-retangular", "tubo-redondo"],
    });
    expect(pistaDoCodigoPeca("MSVCH PC002 ICSLD")).toEqual({ liga: "INOX430", formas: ["chapa"] });
    expect(pistaDoCodigoPeca("MSVCH PC017 IAPOL")).toEqual({ liga: "INOX430", formas: ["trefilado-redondo"] });
  });

  it('submontagem ("I0POL") não restringe forma nenhuma', () => {
    expect(pistaDoCodigoPeca("MSVCH SM001 I0POL")).toEqual({ liga: "INOX430", formas: null });
  });
});

describe("lerEspecificacao", () => {
  it("lê os formatos que a BOM do CAD usa", () => {
    expect(lerEspecificacao("TUBO QUAD 25,00x25,00x1,20mm")).toEqual({
      forma: "tubo-quadrado",
      ladoA: 25,
      ladoB: 25,
      espessura: 1.2,
      casasDecimais: 2,
    });
    expect(lerEspecificacao("TUBO RED. 19,1x1,5mm")).toEqual({
      forma: "tubo-redondo",
      diametro: 19.1,
      espessura: 1.5,
      casasDecimais: 1,
    });
    expect(lerEspecificacao("# 3,0000")).toEqual({ forma: "chapa", espessura: 3, casasDecimais: 4 });
    expect(lerEspecificacao("TREF. Ø6,25")).toEqual({
      forma: "trefilado-redondo",
      diametro: 6.25,
      casasDecimais: 2,
    });
  });

  it("a precisão sai da medida escrita mais curta, e ignora o que sobra do texto", () => {
    // "1,5" (1 casa) manda no conjunto, não o "19,05" nem o "430" da liga.
    expect(lerEspecificacao("TUBO REDONDO Ø19,05x1,5 AÇO INOX 430 (6000mm)")).toEqual({
      forma: "tubo-redondo",
      diametro: 19.05,
      espessura: 1.5,
      casasDecimais: 1,
    });
    // Medida inteira: nenhuma casa decimal.
    expect(lerEspecificacao("TUBO QUADRADO 25x25x1.2 AÇO INOX 430")?.casasDecimais).toBe(0);
  });

  it("ignora o que está entre parênteses na descrição do cadastro MAT", () => {
    // "(1200x2000)" é a chapa inteira, não a espessura.
    expect(lerEspecificacao("CHAPA ESP 3,00 AÇO INOX 430 (1200x2000)")).toEqual({
      forma: "chapa",
      espessura: 3,
      casasDecimais: 2,
    });
  });

  it("recusa bitola em polegada e sextavado (não dá pra comparar em mm)", () => {
    expect(lerEspecificacao("TREFILADO REDONDO 2 POL AÇO SAE 1020")).toBeNull();
    expect(lerEspecificacao("TREFILADO SEXTAVADO 5/8 POL AÇO CARBONO 1020")).toBeNull();
  });

  it('"POLIDO"/"POLIACETAL" não são confundidos com polegada', () => {
    expect(lerEspecificacao("TUBO QUADRADO 25x25x1.2 AÇO INOX POLIDO 430 (6000mm)")).toEqual({
      forma: "tubo-quadrado",
      ladoA: 25,
      ladoB: 25,
      espessura: 1.2,
      casasDecimais: 0,
    });
  });

  it("texto que não descreve matéria-prima conhecida vira null", () => {
    expect(lerEspecificacao("PERFIL REDONDO ABERTO Ø19,05x4,0 BORRACHA LISA PRETO")).toBeNull();
    expect(lerEspecificacao("")).toBeNull();
  });
});

describe("indexarCatalogo", () => {
  it("marca como ambíguo o cadastro cuja liga do código discorda da descrição", () => {
    const contraditorio = CATALOGO.find((i) => i.codigo === "MATTB RD127 12C12");
    expect(contraditorio?.ambiguo).toBe(true);
  });

  it("cadastro coerente não fica ambíguo", () => {
    expect(CATALOGO.find((i) => i.codigo === "MATTB Q2525 12I43")?.ambiguo).toBe(false);
    expect(CATALOGO.find((i) => i.codigo === "MATCH 00300 IN430")?.liga).toBe("INOX430");
  });

  it("devolve em ordem alfabética (é a ordem da lista de escolha na tela)", () => {
    const descricoes = CATALOGO.map((i) => i.descricao);
    const ordenadas = [...descricoes].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }),
    );
    expect(descricoes).toEqual(ordenadas);
    // A entrada vem embaralhada do Omie (chapa de acrílico depois das de inox,
    // tubo de carbono no meio dos de inox): a ordenação é de verdade.
    expect(descricoes).not.toEqual(CATALOGO_BRUTO.map((i) => i.descricao));
    expect(CATALOGO[0].codigo).toBe("MATCH 00090 AC012");
  });
});

describe("casarMateriaPrima: peças reais da BOM MSVCH MT001 I0POL", () => {
  it("tubo quadrado de inox bate exato", () => {
    const r = casar("MSVCH PC001 ITSLD", "TUBO QUAD 25,00x25,00x1,20mm");
    expect(r?.item.codigo).toBe("MATTB Q2525 12I43");
    expect(r?.confianca).toBe("exata");
  });

  it("chapa de inox bate exato pela espessura", () => {
    expect(casar("MSVCH PC002 ICSLD", "# 3,0000")?.item.codigo).toBe("MATCH 00300 IN430");
    expect(casar("MSVCH PC004 ICSLD", "# 0,9000")?.item.codigo).toBe("MATCH 00090 IN430");
    expect(casar("MSVCH PC010 ICPOL", "# 1,2000")?.item.codigo).toBe("MATCH 00120 IN430");
    expect(casar("MSVCH PC011 ICPOL", "# 2,0000")?.item.codigo).toBe("MATCH 00200 IN430");
    expect(casar("MSVCH PC006 ICSLD", "# 1,5000")?.item.codigo).toBe("MATCH 00150 IN430");
  });

  it("a liga do código separa inox de carbono e de acrílico na mesma espessura", () => {
    // Existem chapa de 0,9 em inox e em carbono; e chapa de 2,0 em inox e acrílico.
    expect(casar("MSVCH PC004 ICSLD", "# 0,9000")?.item.codigo).toBe("MATCH 00090 IN430");
    expect(casar("MSVCH PC099 CCSLD", "# 0,9000")?.item.codigo).toBe("MATCH 00090 AC012");
  });

  it("tubo redondo casa mesmo com a BOM arredondando a bitola", () => {
    // BOM: Ø19,1 / cadastro: Ø19,05.
    const r = casar("MSVCH PC007 ITSLD", "TUBO RED. 19,1x1,5mm");
    expect(r?.item.codigo).toBe("MATTB RD190 15I43");
    expect(r?.confianca).toBe("exata");
    // BOM: Ø15,9 / cadastro: Ø15,88.
    expect(casar("MSVCH PC018 ITPOL", "TUBO RED. 15,9x1,2mm")?.item.codigo).toBe("MATTB RD158 12I43");
  });

  it("tubo casa exato mesmo quando a BOM TRUNCA a bitola em vez de arredondar", () => {
    // Caso real da BOM "MCPSO MT002 I0POL R00": o CAD escreve Ø15,8 para o
    // cadastro Ø15,88 (0,08 de diferença, mais do que um arredondamento).
    const r = casar("SPS4P PC001 ITPOL", "TUBO RED. 15,8x1,2mm");
    expect(r?.item.codigo).toBe("MATTB RD158 12I43");
    expect(r?.confianca).toBe("exata");
  });

  it("com DUAS casas a BOM já deu a bitola cheia, e a folga encolhe", () => {
    // Ø6,25 continua sendo outra bitola que Ø6,35, e não vira "exata" só porque
    // o tubo escrito com uma casa passou a aceitar um décimo de folga.
    expect(casar("MSVCH PC017 IAPOL", "TREF. Ø6,25")?.confianca).toBe("aproximada");
  });

  it("a parede do tubo separa cadastros do mesmo diâmetro", () => {
    expect(casar("MSVCH PC0XX ITSLD", "TUBO RED. 19,05x1,2mm")?.item.codigo).toBe("MATTB RD190 12I43");
    expect(casar("MSVCH PC0XX ITSLD", "TUBO RED. 19,05x1,5mm")?.item.codigo).toBe("MATTB RD190 15I43");
  });

  it("trefilado com bitola só parecida vem como APROXIMADA (precisa confirmar)", () => {
    // BOM: Ø6,25 / cadastro mais próximo: Ø6,35.
    const r = casar("MSVCH PC017 IAPOL", "TREF. Ø6,25");
    expect(r?.item.codigo).toBe("MATTF RD635 00I43");
    expect(r?.confianca).toBe("aproximada");
  });

  it("cadastro ambíguo nunca é escolhido sozinho", () => {
    // Ø12,7x1,2 inox só existe no cadastro contraditório MATTB RD127 12C12.
    expect(casar("MSVCH PC0XX ITSLD", "TUBO RED. 12,7x1,2mm")).toBeNull();
  });

  it("bitola que não existe no catálogo não inventa item", () => {
    expect(casar("MSVCH PC0XX ITSLD", "TUBO QUAD 60,00x60,00x3,00mm")).toBeNull();
  });

  it("material desconhecido no código não escolhe entre ligas diferentes", () => {
    // "AC" = material fora da tabela (acrílico) + chapa. A espessura 2,0 existe
    // em inox E em acrílico: escolher uma delas mandaria a matéria-prima errada.
    expect(casar("MSVCH PC032 ACSLD", "# 2,0000")).toBeNull();
    // 0,9 existe em inox E em carbono: mesma ambiguidade.
    expect(casar("MSVCH PC033 ACSLD", "# 0,9000")).toBeNull();
  });

  it("material desconhecido ainda resolve quando a geometria só existe numa liga", () => {
    // 1,2 e 3,0 só estão cadastradas em inox neste recorte: não há o que confundir.
    expect(casar("MSVCH PC034 ACSLD", "# 3,0000")?.item.codigo).toBe("MATCH 00300 IN430");
  });
});

describe("pesoParaKg", () => {
  it("gramas viram quilos com 3 casas", () => {
    expect(pesoParaKg(1053.36, "g")).toBe(1.053);
    expect(pesoParaKg(19.42, "g")).toBe(0.019);
    expect(pesoParaKg(611, "g")).toBe(0.611);
  });

  it("quando a planilha já vem em quilos, só arredonda", () => {
    expect(pesoParaKg(1.05336, "kg")).toBe(1.053);
    expect(pesoParaKg(2, "kg")).toBe(2);
  });
});

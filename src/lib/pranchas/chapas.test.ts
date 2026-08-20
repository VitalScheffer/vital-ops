import { describe, expect, it } from "vitest";

import { indexarCatalogo, type ItemMat } from "@/lib/produtos/materiaPrima";

import type { ItemBom } from "./bom";
import { parseCode } from "./codes";
import { agruparMateriaPrima, DENSIDADE, medidaDaChapa } from "./chapas";

// Recorte real do catálogo MAT do Omie (leitura de 20/08/2026). As medidas entre
// parênteses NÃO são todas iguais: aço vem em 1200x2000 e acrílico/PVC em
// 1000x2000, e é por isso que a medida sai do cadastro, não de uma constante.
const CATALOGO: ItemMat[] = indexarCatalogo([
  { codigo: "MATCH 00060 AC012", descricao: "MATCH 00060 AC012 - CHAPA ESP 0,60 AÇO CARBONO 1020 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00090 IN430", descricao: "MATCH 00090 IN430 - CHAPA 0,9 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00200 PEB00", descricao: "MATCH 00200 PEB00 - CHAPA ESP 2,00 PVC EXPANDIDO BRANCO (1000x2000)", unidade: "KG" },
  { codigo: "MATCH 01000 MM0LB", descricao: "MATCH 01000 MM0LB - CHAPA DE MDF 10mm LAMINADO BRANCO", unidade: "KG" },
  { codigo: "MATTB QD250 12I43", descricao: "MATTB QD250 12I43 - TUBO QUADRADO 25x25x1.2 AÇO INOX POLIDO 430 (6000mm)", unidade: "KG" },
  // Cadastro que NÃO é medido por peso: existe assim no Omie (perfil de borracha
  // em M, courvin em M²). A geometria abaixo lê como chapa de propósito.
  { codigo: "MATTC CRV10 000LB", descricao: "MATTC CRV10 000LB - CHAPA 5,0 TECIDO COURVIN LISO BEGE (1400x1000)", unidade: "M²" },
]);

function item(peca: string, quantidadeEfetiva: number, peso: number | null, especificacao: string): ItemBom {
  const code = parseCode(peca);
  if (!code) throw new Error(`código inválido no teste: ${peca}`);
  return { code, numero: "1", quantidade: quantidadeEfetiva, quantidadeEfetiva, peso, especificacao };
}

describe("medidaDaChapa", () => {
  it("lê a medida entre parênteses do cadastro do Omie", () => {
    expect(medidaDaChapa("MATCH 00060 AC012 - CHAPA ESP 0,60 AÇO CARBONO 1020 (1200x2000)")).toEqual({
      larguraMm: 1200,
      comprimentoMm: 2000,
      areaM2: 2.4,
    });
  });

  it("aceita a medida do acrílico e do PVC, que é outra", () => {
    expect(medidaDaChapa("CHAPA ESP 2,00 PVC EXPANDIDO BRANCO (1000x2000)")?.areaM2).toBe(2);
  });

  it("devolve null quando o cadastro não traz medida", () => {
    expect(medidaDaChapa("MATCH 01000 MM0LB - CHAPA DE MDF 10mm LAMINADO BRANCO")).toBeNull();
  });

  it("não confunde o comprimento da barra do tubo com medida de chapa", () => {
    expect(medidaDaChapa("TUBO QUADRADO 25x25x1.2 AÇO INOX POLIDO 430 (6000mm)")).toBeNull();
  });
});

describe("agruparMateriaPrima", () => {
  const opcoes = { unidadePeso: "g" as const, multiplicador: 1, aproveitamento: 1 };

  it("soma o peso das peças que consomem a mesma chapa", () => {
    const linhas = agruparMateriaPrima(
      [
        item("CREHI PC012 CCSLD R00 - CHAPARIA FRONTAL ESQUERDA", 1, 730.4, "# 0,6000"),
        item("CREHI PC008 CCPTD R00 - CHAPA TRASEIRA DIREITA", 1, 1598.72, "# 0,6000"),
      ],
      CATALOGO,
      opcoes,
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].codigoMat).toBe("MATCH 00060 AC012");
    expect(linhas[0].quantidade).toBeCloseTo(2.329, 3); // 0,7304 + 1,59872 kg
  });

  it("multiplica pela quantidade efetiva da peça e pelos conjuntos a produzir", () => {
    const linhas = agruparMateriaPrima(
      [item("CREHI PC011 CCPTD R00 - CHAPA LATERAL", 2, 871.79, "# 0,6000")],
      CATALOGO,
      { ...opcoes, multiplicador: 10 },
    );
    expect(linhas[0].quantidade).toBeCloseTo(17.436, 3); // 0,87179 × 2 × 10
  });

  it("converte o quilo em metro quadrado pela espessura e pela densidade", () => {
    const linhas = agruparMateriaPrima(
      // 1 m² de chapa de 1mm de inox pesa 7,7 kg; aqui são 0,9mm × 7,7 = 6,93 kg/m².
      [item("CREHI PC001 ICPOL R00 - TAMPA", 1, 6930, "# 0,9000")],
      CATALOGO,
      opcoes,
    );
    expect(linhas[0].areaM2).toBeCloseTo(1, 3);
  });

  it("arredonda a compra para chapas inteiras", () => {
    const linhas = agruparMateriaPrima(
      // 6,93 kg = 1 m² de inox 0,9; a chapa inteira tem 2,4 m².
      [item("CREHI PC001 ICPOL R00 - TAMPA", 3, 6930, "# 0,9000")],
      CATALOGO,
      opcoes,
    );
    expect(linhas[0].areaM2).toBeCloseTo(3, 3);
    expect(linhas[0].chapas).toBe(2); // 3 / 2,4 = 1,25 chapas
  });

  it("desconta a perda de corte pelo aproveitamento informado na tela", () => {
    const linhas = agruparMateriaPrima(
      [item("CREHI PC001 ICPOL R00 - TAMPA", 3, 6930, "# 0,9000")],
      CATALOGO,
      { ...opcoes, aproveitamento: 0.5 },
    );
    // 3 m² aproveitando metade da chapa: cada chapa rende 1,2 m², então 3.
    expect(linhas[0].chapas).toBe(3);
  });

  it("resolve a chapa de PVC pela inicial V do código da peça", () => {
    const linhas = agruparMateriaPrima(
      [item("CREHI PC005 VCCSR R00 - DIVISÓRIA MENOR", 4, 106.08, "# 2,0000")],
      CATALOGO,
      opcoes,
    );
    expect(linhas[0].codigoMat).toBe("MATCH 00200 PEB00");
  });

  it("não converte para chapas quando o cadastro do Omie não tem a medida", () => {
    const linhas = agruparMateriaPrima(
      [item("CREHI PC030 MCSLD R00 - FUNDO DE MDF", 1, 5000, "# 10,0000")],
      CATALOGO,
      opcoes,
    );
    expect(linhas[0].quantidade).toBeCloseTo(5, 3);
    expect(linhas[0].chapas).toBeNull();
    expect(linhas[0].motivo).toMatch(/medida da chapa/i);
  });

  it("lista o tubo com o peso, sem inventar metro quadrado", () => {
    const linhas = agruparMateriaPrima(
      [item("CREHI PC015 ITSLD R00 - BRAÇO PARA MOVIMENTO", 1, 224.74, "TUBO QUAD 25,00x25,00x1,20mm")],
      CATALOGO,
      opcoes,
    );
    expect(linhas[0].codigoMat).toBe("MATTB QD250 12I43");
    expect(linhas[0].areaM2).toBeNull();
    expect(linhas[0].chapas).toBeNull();
  });

  it("mostra a peça que não resolveu, com o motivo, em vez de escondê-la", () => {
    const linhas = agruparMateriaPrima(
      [item("CREHI PC007 ACFRS R00 - TABUA DE MASSAGEM", 1, 2166.48, "")],
      CATALOGO,
      opcoes,
    );
    expect(linhas[0].codigoMat).toBe("");
    expect(linhas[0].pecas).toEqual(["CREHI PC007 ACFRS"]);
    expect(linhas[0].motivo).toMatch(/especificação/i);
  });

  it("deixa comprados e submontagens de fora: quem consome matéria-prima é a peça", () => {
    const linhas = agruparMateriaPrima(
      [
        item("CREHI SM001 C0PTD R00 - ALÇA DE MOVIMENTAÇÃO", 1, 294.44, ""),
        item("COMDB P0381 018AC - DOBRADIÇA DE PINO ROCHA 38,1x18", 2, null, ""),
      ],
      CATALOGO,
      opcoes,
    );
    expect(linhas).toHaveLength(0);
  });

  it("não diz 0 chapa quando a BOM veio sem o peso da peça", () => {
    const linhas = agruparMateriaPrima(
      [item("CREHI PC020 CCSLD R00 - SUP. BRAÇO DE MOVIMENTO", 2, null, "# 0,6000")],
      CATALOGO,
      opcoes,
    );
    expect(linhas[0].codigoMat).toBe("MATCH 00060 AC012");
    expect(linhas[0].chapas).toBeNull();
    expect(linhas[0].areaM2).toBeNull();
    expect(linhas[0].motivo).toMatch(/peso/i);
  });

  it("avisa quando SÓ ALGUMAS peças da linha vieram sem peso", () => {
    const linhas = agruparMateriaPrima(
      [
        item("CREHI PC012 CCSLD R00 - CHAPARIA FRONTAL ESQUERDA", 1, 730.4, "# 0,6000"),
        item("CREHI PC008 CCPTD R00 - CHAPA TRASEIRA DIREITA", 1, null, "# 0,6000"),
      ],
      CATALOGO,
      opcoes,
    );
    // O total continua saindo (a outra peça tem peso), mas dizer só o número
    // seria dizer que a conta fechou, e ela está por baixo do consumo real.
    expect(linhas[0].quantidade).toBeCloseTo(0.73, 2);
    expect(linhas[0].motivo).toMatch(/CREHI PC008 CCPTD/);
    expect(linhas[0].motivo).toMatch(/ABAIXO/);
  });

  it("não escreve o quilo debaixo de um cadastro que não é medido por peso", () => {
    const linhas = agruparMateriaPrima(
      // Inicial fora da tabela de materiais: quem manda no casamento é a
      // geometria, e chapa de 5,0 só existe no courvin neste recorte.
      [item("CREHI PC040 XCSLD R00 - REVESTIMENTO", 1, 500, "# 5,0000")],
      CATALOGO,
      opcoes,
    );
    expect(linhas[0].codigoMat).toBe("MATTC CRV10 000LB");
    expect(linhas[0].unidade).toBe("M²");
    expect(linhas[0].quantidade).toBeNull();
    expect(linhas[0].motivo).toMatch(/M²/);
  });

  it("marca a linha quando a densidade usada é estimada", () => {
    const linhas = agruparMateriaPrima(
      [item("CREHI PC005 VCCSR R00 - DIVISÓRIA MENOR", 1, 106.08, "# 2,0000")],
      CATALOGO,
      opcoes,
    );
    expect(linhas[0].densidadeConfirmada).toBe(false);
    expect(DENSIDADE.INOX430.confirmada).toBe(true);
  });
});

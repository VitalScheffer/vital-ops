import { describe, expect, it } from "vitest";

import {
  candidatesFor,
  chooseCandidate,
  extractCodes,
  extractItems,
  parseCode,
  parseCodeFromFileName,
  type DrawingCode,
} from "./codes";

// Trecho real da BOM "CREHI MT005" (formato atual 5-5-5), com submontagens,
// peças, itens comprados e a quantidade da coluna QTD.
const BOM_ATUAL = [
  "Nº Nº DA PEÇA QTD.",
  "1 CREHI SM001 I0POL R00 - ALÇA DE MOVIMENTAÇÃO 1",
  "1.1 CREHI PC015 ITSLD R00 - BRAÇO PARA MOVIMENTO 1",
  "2.2 COMDB P0381 018AC - DOBRADIÇA DE PINO ROCHA 38,1x18 - 01 AC 2",
  "9 CREHI PC005 VCCSR R00 - DIVISÓRIA MENOR 4",
  "25 COMAD LT000 00025 - CADEADO LATÃO CR25 1",
  "33 COMRZ G3PSF E0635 - RODIZIO 3 POL. GIRATORIO PLASTICO S. FREIO ESPIGA 6.35 2",
].join(" \n ");

// Trecho real do BOM "C4MEC M01 R00 - MONTAGEM COMPLETA (CUSTO)" (formato antigo).
const BOM_ANTIGO = [
  "Nº PEÇA INOX CARBONO QTD.",
  "1 C4MEC P01 C00 R00 - ESTRUTURA INFERIOR 75,60 40,32 1",
  "3 PORCA M12 SEXTAVADA 0,18 0,18 4",
  "7 C3SM P05 C00 R00 - BUCHA_BRAÇO DE LIGAMENTO 0,76 0,38 4",
  "25 C3SM P08 C00 R01 - QUADRO FIXO 48,24 24,56 1",
  "41 ATUADOR SCHEFFER FY011C - 150mm - 01 72,10 72,10 2",
  "69 GDPM P14 C00 R03 - BRAÇO VERTICAL MECANISMO BASCULANTE MAIOR 5,37 3,53 8",
].join(" ");

describe("parseCode — formato atual (5-5-5)", () => {
  it("lê os três blocos e a revisão", () => {
    expect(parseCode("1.1 CREHI PC015 ITSLD R00 - BRAÇO PARA MOVIMENTO")).toMatchObject({
      familia: "CREHI",
      tipo: "PC015",
      material: "ITSLD",
      r: 0,
      key: "CREHI PC015 ITSLD",
      raw: "CREHI PC015 ITSLD R00",
      comercial: false,
    });
  });

  it("aceita desenho sem revisão no código (r = -1)", () => {
    expect(parseCode("CME4I PC007 CCSLD - LIGAMENTO ATUADORES INF.")).toMatchObject({
      key: "CME4I PC007 CCSLD",
      raw: "CME4I PC007 CCSLD",
      r: -1,
    });
  });

  it("o bloco de material faz parte da identidade (carbono ≠ inox)", () => {
    // Mesmo prefixo e mesma sequência, peças diferentes. Fundir as duas faria o
    // compilador imprimir a prancha errada.
    expect(parseCode("SPDSP PC001 INCTP R00")?.key).toBe("SPDSP PC001 INCTP");
    expect(parseCode("SPDSP PC001 INDTP R00")?.key).toBe("SPDSP PC001 INDTP");
    expect(parseCode("CREHS PC001 CCSLD R00")?.key).not.toBe(parseCode("CREHS PC001 ICSLD R00")?.key);
  });

  it("não gera código fantasma quando o nome ainda traz o C## antigo", () => {
    const itens = extractItems("POADH PC008 CCSLD C00 R00 - ORELHA DO ASSENTO");
    expect(itens).toHaveLength(1);
    expect(itens[0].key).toBe("POADH PC008 CCSLD");
    expect(itens[0].r).toBe(0);
  });
});

describe("itens comprados (família COM*)", () => {
  it("são reconhecidos como comercial, não como desenho", () => {
    expect(parseCode("COMDB P0381 018AC - DOBRADIÇA DE PINO ROCHA")).toMatchObject({
      key: "COMDB P0381 018AC",
      comercial: true,
    });
  });

  it("família COM vence mesmo quando o bloco 2 parece de desenho", () => {
    // "LT000" bate no padrão letras+sequência; só a família "COM" o distingue.
    expect(parseCode("COMAD LT000 00025 - CADEADO LATÃO CR25")?.comercial).toBe(true);
  });

  it("ficam de fora da lista de pranchas", () => {
    const desenhos = extractCodes(BOM_ATUAL);
    expect(desenhos.every((c) => !c.comercial)).toBe(true);
    expect(desenhos.map((c) => c.key)).toEqual([
      "CREHI SM001 I0POL",
      "CREHI PC015 ITSLD",
      "CREHI PC005 VCCSR",
    ]);
  });

  it("mas continuam disponíveis em extractItems, para a lista de materiais", () => {
    const comerciais = extractItems(BOM_ATUAL).filter((c) => c.comercial);
    expect(comerciais.map((c) => c.key)).toEqual([
      "COMDB P0381 018AC",
      "COMAD LT000 00025",
      "COMRZ G3PSF E0635",
    ]);
  });
});

describe("texto que não é código", () => {
  it("ignora comprados sem código e linhas de cabeçalho/total", () => {
    expect(parseCode("3 PORCA M12 SEXTAVADA 0,18")).toBeNull();
    expect(parseCode("41 ATUADOR SCHEFFER FY011C - 150mm - 01")).toBeNull();
    expect(parseCode("RODIZIO 3 POLEGADAS COM TRAVA 75MM CINZA")).toBeNull();
    expect(parseCode("TOTAL GERAL 1.234,56 PECAS 45")).toBeNull();
    expect(parseCode("Nº PEÇA INOX CARBONO QTD.")).toBeNull();
  });
});

describe("formato antigo", () => {
  it("continua sendo lido quando o texto não tem nenhum código atual", () => {
    const codes = extractCodes(BOM_ANTIGO);
    expect(codes.map((c) => c.raw)).toEqual([
      "C4MEC P01 C00 R00",
      "C3SM P05 C00 R00",
      "C3SM P08 C00 R01",
      "GDPM P14 C00 R03",
    ]);
  });

  it("lê submontagem sem bloco C (MDMI SM13 R00)", () => {
    expect(parseCode("MDMI SM13 R00 - ESTRUTURA DA MESA")).toMatchObject({
      familia: "MDMI",
      tipo: "SM13",
      material: "",
      r: 0,
      key: "MDMI SM13",
    });
  });

  it("não confunde peças de mesma sequência com prefixos diferentes", () => {
    const d = extractCodes("C4MEC P05 C00 R00 - X 1,0 1,0 1 C3SM P05 C00 R00 - Y 1,0 1,0 1");
    expect(d.map((c) => c.key)).toEqual(["C4MEC P05 C00", "C3SM P05 C00"]);
  });
});

describe("parseCodeFromFileName", () => {
  it("casa os nomes de arquivo de produção", () => {
    expect(parseCodeFromFileName("BRCRH PC001 CTSLD R00 - ESTRUTURA LATERAL.pdf")?.raw).toBe(
      "BRCRH PC001 CTSLD R00",
    );
    expect(parseCodeFromFileName("CME4I SM009 ACPTD  - ALONGAMENDO P. LEITO.pdf")?.raw).toBe(
      "CME4I SM009 ACPTD",
    );
    expect(parseCodeFromFileName("MDMI_P22_C00_R00_MESA.pdf")?.raw).toBe("MDMI P22 C00 R00");
  });
});

describe("descrição", () => {
  it("captura a descrição de uma linha isolada (caminho da planilha)", () => {
    // lerCodigosDoBom lê a planilha célula a célula, então a descrição chega
    // sem a coluna de quantidade colada nela.
    expect(parseCode("  CREHI SM001 I0POL R00 - ALÇA DE MOVIMENTAÇÃO")?.desc).toBe(
      "ALÇA DE MOVIMENTAÇÃO",
    );
    // A normalização troca "_" por espaço (mesma regra do casamento de nomes).
    expect(parseCode("7 C3SM P05 C00 R00 - BUCHA_BRAÇO DE LIGAMENTO 0,76 0,38 4")?.desc).toBe(
      "BUCHA BRAÇO DE LIGAMENTO",
    );
  });

  it("no texto solto de um PDF a descrição pode encostar na quantidade", () => {
    // Sem colunas não dá para separar com segurança; a descrição é cosmética e
    // não participa do casamento, então isso é tolerado (e é por isso que a
    // lista de materiais exige a planilha).
    expect(extractCodes(BOM_ATUAL)[0].desc).toBe("ALÇA DE MOVIMENTAÇÃO 1");
  });
});

function code(raw: string): DrawingCode {
  const c = parseCode(raw);
  if (!c) throw new Error(`código inválido no teste: ${raw}`);
  return c;
}

describe("candidatesFor", () => {
  it("filtra pela identidade completa, não pela sequência", () => {
    const index = [
      { code: code("SPDSP PC001 INCTP R00") },
      { code: code("SPDSP PC001 INDTP R00") },
      { code: code("SPDSP PC001 INCTP R01") },
    ];
    const cands = candidatesFor(code("SPDSP PC001 INCTP R00"), index);
    expect(cands).toHaveLength(2);
    expect(cands.every((c) => c.code.material === "INCTP")).toBe(true);
  });
});

describe("chooseCandidate", () => {
  it("exact: acha a revisão exata do BOM", () => {
    const cands = [code("CREHS PC001 CCSLD R00"), code("CREHS PC001 CCSLD R01")];
    const r = chooseCandidate(code("CREHS PC001 CCSLD R01"), cands, "exact");
    expect(r.status).toBe("ok");
    expect(cands[r.index].raw).toBe("CREHS PC001 CCSLD R01");
  });

  it("exact: avisa que existe revisão mais nova, mas escolhe a exata", () => {
    const cands = [code("CREHS PC001 CCSLD R00"), code("CREHS PC001 CCSLD R01")];
    const r = chooseCandidate(code("CREHS PC001 CCSLD R00"), cands, "exact");
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("mais nova");
    expect(cands[r.index].raw).toBe("CREHS PC001 CCSLD R00");
  });

  it("exact: revisão pedida ausente vira warn e aponta a mais nova", () => {
    const cands = [code("CREHS PC001 CCSLD R01")];
    const r = chooseCandidate(code("CREHS PC001 CCSLD R00"), cands, "exact");
    expect(r.status).toBe("warn");
    expect(cands[r.index].raw).toBe("CREHS PC001 CCSLD R01");
  });

  it("arquivo sem revisão casa com o que o BOM pedir, marcado para conferência", () => {
    const cands = [code("CME4I PC007 CCSLD")];
    const r = chooseCandidate(code("CME4I PC007 CCSLD R00"), cands, "exact");
    expect(r.status).toBe("norev");
    expect(r.index).toBe(0);
    expect(r.detail).toContain("não declara revisão");
  });

  it("prefere a revisão exata a um arquivo sem revisão", () => {
    const cands = [code("CME4I PC007 CCSLD"), code("CME4I PC007 CCSLD R00")];
    const r = chooseCandidate(code("CME4I PC007 CCSLD R00"), cands, "exact");
    expect(r.status).toBe("ok");
    expect(cands[r.index].r).toBe(0);
  });

  it("latest: pega a mais nova e sinaliza que difere do BOM", () => {
    const cands = [code("CREHS PC001 CCSLD R00"), code("CREHS PC001 CCSLD R01")];
    const r = chooseCandidate(code("CREHS PC001 CCSLD R00"), cands, "latest");
    expect(r.status).toBe("new");
    expect(cands[r.index].raw).toBe("CREHS PC001 CCSLD R01");
  });

  it("sem candidatos: miss", () => {
    const r = chooseCandidate(code("CREHS PC099 CCSLD R00"), [], "exact");
    expect(r.status).toBe("miss");
    expect(r.index).toBe(-1);
  });
});

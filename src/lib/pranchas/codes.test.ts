import { describe, expect, it } from "vitest";

import {
  candidatesFor,
  chooseCandidate,
  extractCodes,
  parseCode,
  parseCodeFromFileName,
  type DrawingCode,
} from "./codes";

// Trecho real do BOM "C4MEC M01 R00 - MONTAGEM COMPLETA (CUSTO)", com prefixos
// variados (C4MEC, C3SM, C3SE, GDPM) e itens comprados no meio.
const BOM_REAL = [
  "Nº PEÇA INOX CARBONO QTD.",
  "1 C4MEC P01 C00 R00 - ESTRUTURA INFERIOR 75,60 40,32 1",
  "2 C4MEC P09 C00 R00 - LIGAMENTO ATUADORES INF. 3,12 1,96 2",
  "3 PORCA M12 SEXTAVADA 0,18 0,18 4",
  "7 C3SM P05 C00 R00 - BUCHA_BRAÇO DE LIGAMENTO 0,76 0,38 4",
  "25 C3SM P08 C00 R01 - QUADRO FIXO 48,24 24,56 1",
  "40 RODIZIO COLSON 3POL. - GLE 312 BP FP 11,50 11,50 2",
  "41 ATUADOR SCHEFFER FY011C - 150mm - 01 72,10 72,10 2",
  "69 GDPM P14 C00 R03 - BRAÇO VERTICAL MECANISMO BASCULANTE MAIOR 5,37 3,53 8",
].join(" ");

describe("parseCode", () => {
  it("lê um código com prefixo alfanumérico, versão C e revisão R", () => {
    expect(parseCode("1 C4MEC P01 C00 R00 - ESTRUTURA INFERIOR")).toMatchObject({
      prefix: "C4MEC",
      type: "P",
      num: 1,
      c: 0,
      r: 0,
      key: "C4MEC P01",
      raw: "C4MEC P01 C00 R00",
    });
  });

  it("lê código de submontagem sem bloco C (MDMI SM13 R00)", () => {
    expect(parseCode("MDMI SM13 R00 - ESTRUTURA DA MESA")).toMatchObject({
      prefix: "MDMI",
      type: "SM",
      num: 13,
      c: -1,
      r: 0,
      key: "MDMI SM13",
      raw: "MDMI SM13 R00",
    });
  });

  it("não casa item comprado (sem bloco C##/R##)", () => {
    expect(parseCode("3 PORCA M12 SEXTAVADA 0,18")).toBeNull();
    expect(parseCode("41 ATUADOR SCHEFFER FY011C - 150mm - 01")).toBeNull();
    expect(parseCode("PARAFUSO METRICO SEXTAVADO M8x30 ROSCA TOTAL")).toBeNull();
  });
});

describe("parseCodeFromFileName", () => {
  it("casa nomes com hífen, sem descrição e com underscores", () => {
    expect(parseCodeFromFileName("C4MEC P01 C00 R00 - ESTRUTURA INFERIOR.pdf")?.raw).toBe(
      "C4MEC P01 C00 R00",
    );
    expect(parseCodeFromFileName("MDMI P16 C00 R01.pdf")?.raw).toBe("MDMI P16 C00 R01");
    expect(parseCodeFromFileName("MDMI_P22_C00_R00_MESA.pdf")?.raw).toBe("MDMI P22 C00 R00");
  });
});

describe("extractCodes", () => {
  const codes = extractCodes(BOM_REAL);

  it("extrai só os desenhos (ignora comprados), preservando os prefixos distintos", () => {
    expect(codes.map((c) => c.raw)).toEqual([
      "C4MEC P01 C00 R00",
      "C4MEC P09 C00 R00",
      "C3SM P05 C00 R00",
      "C3SM P08 C00 R01",
      "GDPM P14 C00 R03",
    ]);
  });

  it("captura a descrição de cada peça", () => {
    expect(codes[0].desc).toBe("ESTRUTURA INFERIOR");
    // A normalização troca "_" por espaço (mesma regra do casamento de nomes).
    expect(codes[2].desc).toBe("BUCHA BRAÇO DE LIGAMENTO");
  });

  it("não confunde peças de mesma sequência mas prefixos diferentes", () => {
    // C4MEC P05 e C3SM P05 são peças distintas: chaves de família diferentes.
    const distintos = extractCodes("C4MEC P05 C00 R00 - X 1,0 1,0 1 C3SM P05 C00 R00 - Y 1,0 1,0 1");
    expect(distintos.map((c) => c.key)).toEqual(["C4MEC P05", "C3SM P05"]);
  });
});

function code(raw: string): DrawingCode {
  const c = parseCode(raw);
  if (!c) throw new Error(`código inválido no teste: ${raw}`);
  return c;
}

describe("candidatesFor", () => {
  it("filtra por família (prefixo+tipo+num), não só pela sequência", () => {
    const index = [
      { code: code("C4MEC P05 C00 R00") },
      { code: code("C3SM P05 C00 R00") },
      { code: code("C4MEC P05 C00 R01") },
    ];
    const cands = candidatesFor(code("C4MEC P05 C00 R00"), index);
    expect(cands).toHaveLength(2);
    expect(cands.every((c) => c.code.prefix === "C4MEC")).toBe(true);
  });
});

describe("chooseCandidate", () => {
  it("modo exact: acha a revisão exata do BOM", () => {
    const cands = [code("C3SM P08 C00 R00"), code("C3SM P08 C00 R01")];
    const r = chooseCandidate(code("C3SM P08 C00 R01"), cands, "exact");
    expect(r.status).toBe("ok");
    expect(cands[r.index].raw).toBe("C3SM P08 C00 R01");
  });

  it("modo exact: avisa quando existe revisão mais nova, mas escolhe a exata", () => {
    const cands = [code("C3SM P08 C00 R00"), code("C3SM P08 C00 R01")];
    const r = chooseCandidate(code("C3SM P08 C00 R00"), cands, "exact");
    expect(r.status).toBe("ok");
    expect(r.detail).toContain("mais nova");
    expect(cands[r.index].raw).toBe("C3SM P08 C00 R00");
  });

  it("modo exact: revisão pedida ausente vira warn e aponta a mais nova", () => {
    const cands = [code("C3SM P08 C00 R01")];
    const r = chooseCandidate(code("C3SM P08 C00 R00"), cands, "exact");
    expect(r.status).toBe("warn");
    expect(cands[r.index].raw).toBe("C3SM P08 C00 R01");
  });

  it("modo latest: pega sempre a revisão mais nova e sinaliza quando difere do BOM", () => {
    const cands = [code("C3SM P08 C00 R00"), code("C3SM P08 C00 R01")];
    const r = chooseCandidate(code("C3SM P08 C00 R00"), cands, "latest");
    expect(r.status).toBe("new");
    expect(cands[r.index].raw).toBe("C3SM P08 C00 R01");
  });

  it("sem candidatos: miss", () => {
    const r = chooseCandidate(code("C4MEC P99 C00 R00"), [], "exact");
    expect(r.status).toBe("miss");
    expect(r.index).toBe(-1);
  });
});

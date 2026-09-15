import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { localizarColunas } from "./celulas";
import { linhasDaPlanilha, nomeDaOp, planilhaDaOp, totaisEmKgPorTipo } from "./opPlanilha";

const ITENS = [
  { codigo: "MATCH 00060 IN430", descricao: "CHAPA ESP 0,60 AÇO INOX 430", unidade: "KG", quantidade: 21.6566, grupo: "MAT" as const },
  { codigo: "MATTB RD190 15I43", descricao: "TUBO REDONDO Ø19,05x1,5", unidade: "KG", quantidade: 466.803, grupo: "MAT" as const },
  { codigo: "COMBC PI019 E0635", descricao: "BUCHA PLASTICA P. TUBO 19.05", unidade: "UN", quantidade: 40, grupo: "COM" as const },
  { codigo: "CREHS SM001 I0POL", descricao: "CONJUNTO BASE INF.", unidade: "UN", quantidade: 10, grupo: "SBM" as const },
];

describe("nomeDaOp", () => {
  it("troca a barra do cNumOP por hífen (nome de arquivo e de aba não aceitam barra)", () => {
    expect(nomeDaOp("2026/00802")).toBe("OP 2026-00802");
  });
});

describe("linhasDaPlanilha", () => {
  it("o cabeçalho é reconhecido pelo mesmo localizador que o Multiplicador usa", () => {
    const [cabecalho] = linhasDaPlanilha(ITENS);
    const colunas = localizarColunas(cabecalho);

    // Sem isto, a planilha gerada aqui seria recusada pelo próprio Multiplicador.
    expect(colunas.quantidade).toBe(4);
  });

  it("fecha com o total em KG por tipo, depois de uma linha em branco", () => {
    const linhas = linhasDaPlanilha(ITENS);
    // cabeçalho + 4 itens + branco + 1 total (só MAT tem linha em KG)
    expect(linhas).toHaveLength(7);
    expect(linhas[5]).toEqual(["", "", "", "", ""]);
    expect(linhas[6]).toEqual(["TOTAL MAT (KG)", "", "MAT", "KG", 488.4596]);
  });

  it("traz o TIPO de cada item na terceira coluna", () => {
    const linhas = linhasDaPlanilha(ITENS);
    expect(linhas[0][2]).toBe("TIPO");
    expect(linhas[1][2]).toBe("MAT");
    expect(linhas[3][2]).toBe("COM");
  });
});

describe("totaisEmKgPorTipo", () => {
  it("soma o KG do tipo inteiro, não importa em quantas linhas ele veio", () => {
    expect(totaisEmKgPorTipo(ITENS)).toEqual([{ tipo: "MAT", kg: 488.4596 }]);
  });

  it("ignora o que não está em KG (somar KG com UN não significa nada)", () => {
    expect(totaisEmKgPorTipo([ITENS[2], ITENS[3]])).toEqual([]);
  });

  it("não deixa o ponto flutuante vazar para a planilha", () => {
    const kg = totaisEmKgPorTipo([
      { codigo: "A", descricao: "", unidade: "kg", quantidade: 0.1, grupo: "MAT" },
      { codigo: "B", descricao: "", unidade: "KG", quantidade: 0.2, grupo: "MAT" },
    ]);
    expect(kg).toEqual([{ tipo: "MAT", kg: 0.3 }]);
  });
});

describe("planilhaDaOp", () => {
  it("gera um xlsx legível, com a quantidade como NÚMERO", () => {
    const { nome, bytes } = planilhaDaOp("2026/00802", ITENS);
    expect(nome).toBe("OP 2026-00802.xlsx");

    const workbook = XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    expect(workbook.SheetNames[0]).toBe("OP 2026-00802");
    expect(linhas[0].CÓDIGO).toBe("MATCH 00060 IN430");
    expect(linhas[0].TIPO).toBe("MAT");
    expect(linhas[0].QTD).toBe(21.6566);
    expect(typeof linhas[0].QTD).toBe("number");

    const total = linhas.find((linha) => String(linha.CÓDIGO ?? "").startsWith("TOTAL"));
    expect(total?.CÓDIGO).toBe("TOTAL MAT (KG)");
    expect(total?.QTD).toBe(488.4596);
  });

  it("corta o nome da aba no limite de 31 caracteres do Excel", () => {
    const { bytes } = planilhaDaOp("2026/00802-um-numero-absurdamente-longo", ITENS);
    const workbook = XLSX.read(bytes, { type: "array" });
    expect(workbook.SheetNames[0].length).toBeLessThanOrEqual(31);
  });
});

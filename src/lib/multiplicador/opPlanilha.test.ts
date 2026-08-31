import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { localizarColunas } from "./celulas";
import { linhasDaPlanilha, nomeDaOp, planilhaDaOp } from "./opPlanilha";

const ITENS = [
  { codigo: "MATCH 00060 IN430", descricao: "CHAPA ESP 0,60 AÇO INOX 430", unidade: "KG", quantidade: 21.6566 },
  { codigo: "CREHS SM001 I0POL", descricao: "CONJUNTO BASE INF.", unidade: "UN", quantidade: 10 },
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
    expect(colunas.quantidade).toBe(3);
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
    expect(linhas).toHaveLength(2);
    expect(linhas[0].CÓDIGO).toBe("MATCH 00060 IN430");
    expect(linhas[0].QTD).toBe(21.6566);
    expect(typeof linhas[0].QTD).toBe("number");
  });

  it("corta o nome da aba no limite de 31 caracteres do Excel", () => {
    const { bytes } = planilhaDaOp("2026/00802-um-numero-absurdamente-longo", ITENS);
    const workbook = XLSX.read(bytes, { type: "array" });
    expect(workbook.SheetNames[0].length).toBeLessThanOrEqual(31);
  });
});

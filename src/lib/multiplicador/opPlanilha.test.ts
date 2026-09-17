import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { localizarColunas } from "./celulas";
import { agruparPorProduto, linhasDaPlanilha, nomeDaOp, planilhaDaOp } from "./opPlanilha";

// Espelha a OP 2026/00802 conferida no Omie: o mesmo tubo entra em duas peças
// diferentes e sai em duas linhas (263,745 e 203,058), separadas por outros
// itens. A unidade é do CADASTRO: tubo em KG, peça e comprado em UN.
const ITENS = [
  { codigo: "MATTB RD190 12I43", descricao: "TUBO REDONDO Ø19,05x1,2", unidade: "KG", quantidade: 263.745, grupo: "MAT" as const },
  { codigo: "MSMDH PC006 ITPOL", descricao: "TUBO FIX. HASTE", unidade: "UN", quantidade: 450, grupo: "PECA" as const },
  { codigo: "MATTB RD190 12I43", descricao: "TUBO REDONDO Ø19,05x1,2", unidade: "KG", quantidade: 203.058, grupo: "MAT" as const },
  { codigo: "COMBC PI019 E0635", descricao: "BUCHA PLASTICA P. TUBO 19.05", unidade: "UN", quantidade: 1350, grupo: "COM" as const },
];

describe("nomeDaOp", () => {
  it("troca a barra do cNumOP por hífen (nome de arquivo e de aba não aceitam barra)", () => {
    expect(nomeDaOp("2026/00802")).toBe("OP 2026-00802");
  });
});

describe("agruparPorProduto", () => {
  it("soma só o MESMO produto, na unidade dele", () => {
    const grupos = agruparPorProduto(ITENS);
    expect(grupos.map((g) => g.codigo)).toEqual(["MATTB RD190 12I43", "MSMDH PC006 ITPOL", "COMBC PI019 E0635"]);

    const tubo = grupos[0];
    expect(tubo.itens).toHaveLength(2);
    expect(tubo.total).toBe(466.803);
    expect(tubo.unidade).toBe("KG");
    expect(tubo.tipo).toBe("MAT");

    // Peça em UN não entra na conta do tubo em KG: a soma é por produto, nunca
    // por tipo nem por unidade.
    expect(grupos[1].total).toBe(450);
  });

  it("não deixa o ponto flutuante vazar para a planilha", () => {
    const grupos = agruparPorProduto([
      { codigo: "A", descricao: "", unidade: "KG", quantidade: 0.1, grupo: "MAT" },
      { codigo: "A", descricao: "", unidade: "KG", quantidade: 0.2, grupo: "MAT" },
    ]);
    expect(grupos[0].total).toBe(0.3);
  });
});

describe("linhasDaPlanilha", () => {
  it("o cabeçalho é reconhecido pelo mesmo localizador que o Multiplicador usa", () => {
    const [cabecalho] = linhasDaPlanilha(ITENS);
    const colunas = localizarColunas(cabecalho);

    // Sem isto, a planilha gerada aqui seria recusada pelo próprio Multiplicador.
    expect(colunas.quantidade).toBe(4);
  });

  it("mantém as linhas da OP e põe o total do produto logo abaixo delas", () => {
    expect(linhasDaPlanilha(ITENS)).toEqual([
      ["CÓDIGO", "DESCRIÇÃO", "TIPO", "UNIDADE", "QTD"],
      ["MATTB RD190 12I43", "TUBO REDONDO Ø19,05x1,2", "MAT", "KG", 263.745],
      ["MATTB RD190 12I43", "TUBO REDONDO Ø19,05x1,2", "MAT", "KG", 203.058],
      ["TOTAL MATTB RD190 12I43", "", "MAT", "KG", 466.803],
      ["MSMDH PC006 ITPOL", "TUBO FIX. HASTE", "PECA", "UN", 450],
      ["COMBC PI019 E0635", "BUCHA PLASTICA P. TUBO 19.05", "COM", "UN", 1350],
    ]);
  });

  it("produto que entra uma vez só não ganha linha de total repetindo o número", () => {
    const linhas = linhasDaPlanilha([ITENS[1]]);
    expect(linhas).toHaveLength(2);
    expect(linhas[1][0]).toBe("MSMDH PC006 ITPOL");
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
    expect(linhas[0].CÓDIGO).toBe("MATTB RD190 12I43");
    expect(linhas[0].TIPO).toBe("MAT");
    expect(linhas[0].QTD).toBe(263.745);
    expect(typeof linhas[0].QTD).toBe("number");

    const total = linhas.find((linha) => String(linha.CÓDIGO ?? "").startsWith("TOTAL"));
    expect(total?.CÓDIGO).toBe("TOTAL MATTB RD190 12I43");
    expect(total?.UNIDADE).toBe("KG");
    expect(total?.QTD).toBe(466.803);
  });

  it("corta o nome da aba no limite de 31 caracteres do Excel", () => {
    const { bytes } = planilhaDaOp("2026/00802-um-numero-absurdamente-longo", ITENS);
    const workbook = XLSX.read(bytes, { type: "array" });
    expect(workbook.SheetNames[0].length).toBeLessThanOrEqual(31);
  });
});

// A planilha da OP existe para ser multiplicada. Este teste fecha o ciclo
// inteiro (gerar -> multiplicar -> ler) porque o cabeçalho ganhou colunas novas
// e é o `localizarColunas` que decide qual delas o fator pega.
describe("planilha da OP passando pelo multiplicador", () => {
  it("multiplica a QTD de todas as linhas, o total do produto junto", async () => {
    const { multiplicarPlanilha } = await import("./planilha");
    const { nome, bytes } = planilhaDaOp("2026/00802", ITENS);
    const file = new File([bytes as BlobPart], nome, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const resultado = await multiplicarPlanilha(file, { fator: 2, quantidade: true, peso: false });
    const workbook = XLSX.read(resultado.bytes, { type: "array" });
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]]);

    expect(linhas[0].QTD).toBe(527.49);
    expect(linhas[1].QTD).toBe(406.116);
    // O total continua sendo a soma das linhas depois de multiplicado.
    expect(linhas[2].CÓDIGO).toBe("TOTAL MATTB RD190 12I43");
    expect(linhas[2].QTD).toBeCloseTo(933.606, 4);
    expect(linhas[3].QTD).toBe(900);
    // As colunas de texto não podem ter sido tocadas.
    expect(linhas[0].UNIDADE).toBe("KG");
    expect(linhas[0].TIPO).toBe("MAT");
  });
});

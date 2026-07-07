import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { bytesParaBlob, extrairCodigosExistentes, preencherEstrutura, preencherProdutos } from "./omieFile";
import type { EstruturaRel, ParsedItem } from "./types";

const CAMINHO_TEMPLATE = fileURLToPath(
  new URL("../../../public/templates/Omie_Produtos_v1_9_5.xlsx", import.meta.url),
);
const TEMPLATE_BYTES = new Uint8Array(readFileSync(CAMINHO_TEMPLATE));

function bytesTemplate(): Uint8Array {
  return TEMPLATE_BYTES.slice();
}

function item(codigo: string, familia: ParsedItem["familia"] = "SBM - SUBMONTAGEM"): ParsedItem {
  return { linha: 1, raw: "", codigo, descricaoProduto: `${codigo} - desc`, familia, status: "novo" };
}

// Relê o resultado uma vez com o SheetJS e devolve um leitor de células (o read
// do template completo é caro, então relemos uma vez só por arquivo gerado).
function lerCelulas(bytes: Uint8Array): (endereco: string) => unknown {
  const wb = XLSX.read(bytes, { type: "array", sheets: "Omie_Produtos" });
  const sheet = wb.Sheets["Omie_Produtos"];
  return (endereco: string) => sheet[endereco]?.v;
}

describe("omieFile (edição cirúrgica do template real)", () => {
  it("o template oficial começa sem nenhum código cadastrado", () => {
    expect(extrairCodigosExistentes(bytesTemplate())).toEqual([]);
  });

  it("dá mensagem amigável (nunca 'slurp') quando o arquivo não é um Excel legível", () => {
    // "PK\x03\x04" = assinatura de ZIP → o SheetJS tenta abrir como .xlsx e falha
    // no conteúdo corrompido (o caminho que estourava "slurp" pro usuário).
    const zipCorrompido = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00]);
    let mensagem = "";
    try {
      extrairCodigosExistentes(zipCorrompido);
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }
    expect(mensagem).toMatch(/não consegui ler|não protegido/i);
    expect(mensagem.toLowerCase()).not.toContain("slurp");
  });

  it('preenche C/D/E/I/J/AC a partir da linha 6, mantendo "04" como texto', () => {
    const { bytes, resultado } = preencherProdutos(bytesTemplate(), [
      item("CODIGO000000001"),
      item("CODIGO000000002"),
    ]);
    expect(resultado).toEqual({ linhaInicial1Indexed: 6, quantidadeEscrita: 2 });

    const v = lerCelulas(bytes);
    expect(v("C6")).toBe("CODIGO000000001");
    expect(v("D6")).toBe("CODIGO000000001 - desc");
    expect(v("E6")).toBe("9403.20.90");
    expect(v("I6")).toBe("UN");
    expect(v("J6")).toBe("SBM - SUBMONTAGEM");
    expect(v("AC6")).toBe("04"); // texto, não o número 4
    expect(v("C7")).toBe("CODIGO000000002");
  });

  it("não sobrescreve linhas já preenchidas em uma segunda importação", () => {
    const primeira = preencherProdutos(bytesTemplate(), [item("AAAAAAAAAAAAAAA"), item("BBBBBBBBBBBBBBB")]);
    const segunda = preencherProdutos(primeira.bytes, [item("CCCCCCCCCCCCCCC")]);

    expect(segunda.resultado.linhaInicial1Indexed).toBe(8);
    const v = lerCelulas(segunda.bytes);
    expect(v("C6")).toBe("AAAAAAAAAAAAAAA");
    expect(v("C7")).toBe("BBBBBBBBBBBBBBB");
    expect(v("C8")).toBe("CCCCCCCCCCCCCCC");
  });

  it("extrai os códigos já escritos (para dedupe entre importações)", () => {
    const { bytes } = preencherProdutos(bytesTemplate(), [item("AAAAAAAAAAAAAAA"), item("BBBBBBBBBBBBBBB")]);
    expect(extrairCodigosExistentes(bytes)).toEqual(["AAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBB"]);
  });

  it("não escreve a coluna J quando a família não foi reconhecida (null)", () => {
    const { bytes } = preencherProdutos(bytesTemplate(), [item("AAAAAAAAAAAAAAA", null)]);
    expect(lerCelulas(bytes)("J6")).toBeUndefined();
  });

  it("preserva a estrutura do template (as 13 abas continuam lá)", () => {
    const { bytes } = preencherProdutos(bytesTemplate(), [item("AAAAAAAAAAAAAAA")]);
    const wb = XLSX.read(bytes, { type: "array", bookSheets: true });
    expect(wb.SheetNames).toContain("Omie_Produtos");
    expect(wb.SheetNames).toContain("Config");
    expect(wb.SheetNames.length).toBe(13);
  });

  it("escapa caracteres especiais de XML na descrição (& < >)", () => {
    const especial: ParsedItem = {
      linha: 1,
      raw: "",
      codigo: "ABCDE12345FGHIJ",
      descricaoProduto: "ABCDE12345FGHIJ - PEÇA A & B <teste>",
      familia: "PCA - PEÇAS ACABADAS",
      status: "novo",
    };
    const { bytes } = preencherProdutos(bytesTemplate(), [especial]);
    expect(lerCelulas(bytes)("D6")).toBe("ABCDE12345FGHIJ - PEÇA A & B <teste>");
  });

  it("gera um Blob xlsx válido e não vazio", () => {
    const { bytes } = preencherProdutos(bytesTemplate(), [item("AAAAAAAAAAAAAAA")]);
    const blob = bytesParaBlob(bytes);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toContain("spreadsheetml");
  });
});

function rel(codigoPai: string, codigoFilho: string, quantidade: number): EstruturaRel {
  return { numeroPai: "1", numeroFilho: "1.1", codigoPai, codigoFilho, descricaoFilho: "x", quantidade };
}

function lerCelulasEstrutura(bytes: Uint8Array): (endereco: string) => unknown {
  const wb = XLSX.read(bytes, { type: "array", sheets: "Omie_Produtos_Estrutura" });
  const sheet = wb.Sheets["Omie_Produtos_Estrutura"];
  return (endereco: string) => sheet[endereco]?.v;
}

describe("preencherEstrutura (aba Omie_Produtos_Estrutura)", () => {
  it("preenche pai/filho/qtd/local a partir da linha 6", () => {
    const { bytes, resultado } = preencherEstrutura(
      bytesTemplate(),
      [rel("PAI 00001 XXXXX", "FILHO 0001 YYYYY", 3)],
      "Geral",
    );
    expect(resultado).toEqual({ linhaInicial1Indexed: 6, quantidadeEscrita: 1 });

    const v = lerCelulasEstrutura(bytes);
    expect(v("B6")).toBe("PAI 00001 XXXXX"); // Código do Produto Pai
    expect(v("C6")).toBe("FILHO 0001 YYYYY"); // Código do Produto Filho
    expect(v("D6")).toBe("3"); // Quantidade
    expect(v("E6")).toBe("Geral"); // Local de Estoque
  });

  it("sem local de estoque informado, deixa a coluna E vazia", () => {
    const { bytes } = preencherEstrutura(bytesTemplate(), [rel("PAI", "FILHO", 1)]);
    expect(lerCelulasEstrutura(bytes)("E6")).toBeUndefined();
  });

  it("sem relações, devolve os mesmos bytes sem alteração", () => {
    const original = bytesTemplate();
    const { bytes, resultado } = preencherEstrutura(original, []);
    expect(resultado.quantidadeEscrita).toBe(0);
    expect(bytes).toBe(original);
  });
});

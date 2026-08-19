import { describe, expect, it } from "vitest";

import { linhasDaGrade } from "./bomFile";
import { juntarPaginas, montarGradeDaPagina, type ItemTexto } from "./bomPdf";

// Layout de uma BOM do CAD em pontos, na mesma proporção do arquivo real: a
// tabela ocupa a faixa 50..500 e o carimbo da prancha fica fora dela.
const ALTURA = 8;
const LARGURA_CARACTERE = 4.5;

const X = { numero: 50, peca: 90, descricao: 260, qtd: 420, peso: 470 };

function item(texto: string, x: number, y: number): ItemTexto {
  return { texto, x, y, largura: texto.length * LARGURA_CARACTERE, altura: ALTURA };
}

/** Uma linha da tabela: cada texto na coluna correspondente. */
function linha(y: number, cols: Partial<Record<keyof typeof X, string>>): ItemTexto[] {
  return (Object.keys(cols) as (keyof typeof X)[])
    .filter((k) => cols[k] !== undefined)
    .map((k) => item(cols[k]!, X[k] + 2, y));
}

const CABECALHO = [
  item("Nº", X.numero, 700),
  item("PEÇA", X.peca, 700),
  item("DESCRIÇÃO", X.descricao, 700),
  item("QTD", X.qtd, 700),
  item("PESO", X.peso, 700),
];

function bomPadrao(): ItemTexto[] {
  return [
    ...CABECALHO,
    ...linha(686, {
      numero: "1",
      peca: "CPPMC P13 C00 R00",
      descricao: "TUBO QUAD 25,00x25,00x1,20mm",
      qtd: "2",
      peso: "1.053,36",
    }),
    ...linha(672, { numero: "2", peca: "MPACC P02 C00 R00", descricao: "# 3,0000", qtd: "4", peso: "820,5" }),
    ...linha(658, { numero: "3", peca: "COMDB P0381 018AC", descricao: "PORCA M12", qtd: "8" }),
  ];
}

describe("montarGradeDaPagina", () => {
  it("remonta a tabela da BOM na mesma forma da planilha", () => {
    const grade = montarGradeDaPagina(bomPadrao());
    expect(grade).not.toBeNull();
    expect(grade!.cabecalho).toEqual(["Nº", "PEÇA", "DESCRIÇÃO", "QTD", "PESO"]);
    expect(grade!.linhas).toEqual([
      ["1", "CPPMC P13 C00 R00", "TUBO QUAD 25,00x25,00x1,20mm", "2", "1.053,36"],
      ["2", "MPACC P02 C00 R00", "# 3,0000", "4", "820,5"],
      ["3", "COMDB P0381 018AC", "PORCA M12", "8", ""],
    ]);
  });

  it("célula vazia não empurra as colunas seguintes para a esquerda", () => {
    // A 3ª linha não tem PESO. Sem a régua do cabeçalho, o "8" da QTD cairia na
    // coluna do peso (o erro clássico de remontar tabela de PDF por espaçamento).
    const grade = montarGradeDaPagina(bomPadrao())!;
    const semPeso = grade.linhas[2];
    expect(semPeso[3]).toBe("8");
    expect(semPeso[4]).toBe("");
  });

  it("descrição mais larga que o título da coluna continua na coluna dela", () => {
    const grade = montarGradeDaPagina([
      ...CABECALHO,
      ...linha(686, { numero: "1", peca: "CPPMC P13 C00 R00", qtd: "2" }),
      // Texto longo quebrado em dois pedaços pelo pdfjs, como acontece de verdade.
      item("CHAPA DOBRADA GALVANIZADA", X.descricao + 2, 686),
      item("ESPESSURA 1,50mm", X.descricao + 60, 686),
    ])!;
    expect(grade.linhas[0][2]).toBe("CHAPA DOBRADA GALVANIZADA ESPESSURA 1,50mm");
    expect(grade.linhas[0][3]).toBe("2");
  });

  it("junta a linha de continuação quando o CAD quebra a descrição em duas", () => {
    const grade = montarGradeDaPagina([
      ...CABECALHO,
      ...linha(686, {
        numero: "1",
        peca: "CPPMC P13 C00 R00",
        descricao: "TUBO RETANGULAR GALVANIZADO",
        qtd: "2",
      }),
      // Segunda linha da MESMA célula: só a descrição, sem peça.
      ...linha(676, { descricao: "50,00x30,00x1,50mm" }),
      ...linha(662, { numero: "2", peca: "MPACC P02 C00 R00", descricao: "# 3,0000", qtd: "4" }),
    ])!;
    expect(grade.linhas).toHaveLength(2);
    expect(grade.linhas[0][2]).toBe("TUBO RETANGULAR GALVANIZADO 50,00x30,00x1,50mm");
    expect(grade.linhas[0][1]).toBe("CPPMC P13 C00 R00");
    expect(grade.linhas[1][1]).toBe("MPACC P02 C00 R00");
  });

  it("escolhe o cabeçalho da BOM, não um texto solto do carimbo", () => {
    const grade = montarGradeDaPagina([
      // Carimbo da prancha: tem "DESCRIÇÃO", mas é uma coluna só.
      item("DESCRIÇÃO DO PROJETO", 60, 900),
      item("CAMA HOSPITALAR", 60, 890),
      ...bomPadrao(),
    ])!;
    expect(grade.cabecalho).toEqual(["Nº", "PEÇA", "DESCRIÇÃO", "QTD", "PESO"]);
    expect(grade.linhas).toHaveLength(3);
  });

  it("ignora o texto que está fora da faixa da tabela", () => {
    const grade = montarGradeDaPagina([
      ...bomPadrao(),
      item("ESCALA 1:10", 900, 672), // à direita da tabela, na altura de uma linha
    ])!;
    expect(grade.linhas[1]).toEqual(["2", "MPACC P02 C00 R00", "# 3,0000", "4", "820,5"]);
  });

  it("para no fim da tabela em vez de engolir o carimbo lá embaixo", () => {
    const grade = montarGradeDaPagina([
      ...bomPadrao(),
      ...linha(120, { peca: "DESENHISTA", descricao: "IGOR" }),
      ...linha(106, { peca: "APROVADO POR", descricao: "VICTOR" }),
    ])!;
    expect(grade.linhas).toHaveLength(3);
  });

  it("BOM de um item só não engole o carimbo lá embaixo", () => {
    // Com um item só há UM passo de referência. Exigir dois deixaria a tabela
    // sem proteção nenhuma e o carimbo viraria peça.
    const grade = montarGradeDaPagina([
      ...CABECALHO,
      ...linha(686, { numero: "1", peca: "CPPMC P13 C00 R00", descricao: "TUBO QUAD", qtd: "2" }),
      ...linha(120, { peca: "DESENHISTA", descricao: "IGOR" }),
      ...linha(106, { peca: "APROVADO POR", descricao: "VICTOR" }),
    ])!;
    expect(grade.linhas).toHaveLength(1);
    expect(grade.linhas[0][1]).toBe("CPPMC P13 C00 R00");
  });

  it("vão de separador no meio da tabela não corta a BOM", () => {
    // Passos 14, 14, 28, 14, 50: o vão de 50 passa de 3x a MÉDIA dos passos,
    // mas não de 3x o MAIOR já visto. Cortar aqui perderia peça em silêncio.
    const grade = montarGradeDaPagina([
      ...CABECALHO,
      ...linha(686, { numero: "1", peca: "CPPMC P13 C00 R00", qtd: "1" }),
      ...linha(672, { numero: "2", peca: "MPACC P02 C00 R00", qtd: "1" }),
      ...linha(644, { numero: "3", peca: "CPCDA P03 C00 R00", qtd: "1" }),
      ...linha(630, { numero: "4", peca: "SPFAC P07 C01 R00", qtd: "1" }),
      ...linha(580, { numero: "5", peca: "CPPMC P04 C00 R00", qtd: "1" }),
      ...linha(120, { peca: "DESENHISTA", descricao: "IGOR" }),
    ])!;
    expect(grade.linhas).toHaveLength(5);
    expect(grade.linhas[4][1]).toBe("CPPMC P04 C00 R00");
  });

  it("página sem tabela de BOM devolve null", () => {
    expect(montarGradeDaPagina([item("VISTA EXPLODIDA", 100, 400)])).toBeNull();
    expect(montarGradeDaPagina([])).toBeNull();
  });
});

describe("juntarPaginas", () => {
  it("junta as folhas sem repetir o cabeçalho como se fosse peça", () => {
    const p1 = montarGradeDaPagina(bomPadrao());
    const p2 = montarGradeDaPagina([
      ...CABECALHO,
      ...linha(686, { numero: "4", peca: "SPFAC P07 C01 R00", descricao: "TREF. Ø6,25", qtd: "1" }),
    ]);
    const grade = juntarPaginas([p1, p2]);
    expect(grade[0]).toEqual(["Nº", "PEÇA", "DESCRIÇÃO", "QTD", "PESO"]);
    expect(grade).toHaveLength(5); // 1 cabeçalho + 4 peças
    expect(grade.slice(1).filter((l) => l[1] === "PEÇA")).toHaveLength(0);
  });

  it("remapeia pelo nome quando a folha seguinte troca a ordem das colunas", () => {
    const p1 = montarGradeDaPagina(bomPadrao());
    const p2 = montarGradeDaPagina([
      item("PEÇA", X.numero, 700),
      item("Nº", X.peca, 700),
      item("QTD", X.descricao, 700),
      item("SPFAC P07 C01 R00", X.numero + 2, 686),
      item("4", X.peca + 2, 686),
      item("1", X.descricao + 2, 686),
    ]);
    const grade = juntarPaginas([p1, p2]);
    const ultima = grade[grade.length - 1];
    expect(ultima[0]).toBe("4"); // Nº
    expect(ultima[1]).toBe("SPFAC P07 C01 R00"); // PEÇA
    expect(ultima[3]).toBe("1"); // QTD
  });

  it("nenhuma folha com tabela devolve grade vazia", () => {
    expect(juntarPaginas([null, null])).toEqual([]);
  });
});

describe("a grade do PDF alimenta o mesmo leitor da planilha", () => {
  it("quantidade com vírgula decimal do PDF não vira nula", () => {
    // No PDF toda célula é TEXTO. Number("2,00") é NaN, e quantidade nula faz o
    // envio ao Omie assumir 1 sem avisar ninguém.
    const rows = linhasDaGrade([
      ["Nº", "PEÇA", "QTD"],
      ["1", "CPPMC P13 C00 R00", "2,00"],
      ["2", "MPACC P02 C00 R00", "4"],
      ["3", "CPCDA P03 C00 R00", ""],
    ]);
    expect(rows[0].quantidade).toBe(2);
    expect(rows[1].quantidade).toBe(4);
    expect(rows[2].quantidade).toBeNull();
  });

  it("entrega Nº, peça, quantidade, peso e especificação", () => {
    const rows = linhasDaGrade(juntarPaginas([montarGradeDaPagina(bomPadrao())]));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      numero: "1",
      peca: "CPPMC P13 C00 R00",
      quantidade: 2,
      peso: 1053.36,
      especificacao: "TUBO QUAD 25,00x25,00x1,20mm",
    });
    expect(rows[2]).toMatchObject({
      numero: "3",
      peca: "COMDB P0381 018AC",
      quantidade: 8,
      peso: null,
    });
  });
});

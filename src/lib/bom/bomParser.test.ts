import { describe, expect, it } from "vitest";

import { BOM_TESTE_ROWS } from "./__fixtures__/bomTeste";
import { criarEstruturaDaMontagemDestino, DESCRICAO_MAX, parseBom, parseEstrutura } from "./bomParser";
import type { BomRow } from "./types";

function linha(peca: string, overrides: Partial<BomRow> = {}): BomRow {
  return { linha: 1, numero: "1", peca, quantidade: 1, ...overrides };
}

describe("parseBom — BOM real (BOM_TESTE.xls, 37 itens)", () => {
  const resultado = parseBom(BOM_TESTE_ROWS);

  it("não gera nenhum erro de formato nos dados reais", () => {
    expect(resultado.erros).toEqual([]);
  });

  it("detecta os 2 códigos que se repetem na BOM (dobradiça reaproveitada e corrediça usada nos 2 lados)", () => {
    expect(resultado.duplicados).toHaveLength(2);
    const codigos = resultado.duplicados.map((i) => i.codigo);
    expect(codigos).toContain("COMDB P0381 018AC");
    expect(codigos).toContain("COMCD T0350 K35IN");
  });

  it("50 linhas de entrada (37 itens de BOM, alguns com submontagem+filhos) viram 48 novos + 2 duplicados", () => {
    expect(resultado.itens).toHaveLength(50);
    expect(resultado.novos).toHaveLength(48);
    expect(resultado.duplicados).toHaveLength(2);
  });

  it("classifica submontagem (SM) como SBM", () => {
    const item = resultado.itens.find((i) => i.raw.includes("SM001"))!;
    expect(item.codigo).toBe("CREHS SM001 C0PTD");
    expect(item.descricaoProduto).toBe("CREHS SM001 C0PTD - CONJUNTO BASE INF.");
    expect(item.familia).toBe("SBM - SUBMONTAGEM");
  });

  it("classifica peça (PC) terminada em SLD como PCF (fabricada)", () => {
    const item = resultado.itens.find((i) => i.raw.includes("PC001"))!;
    expect(item.codigo).toBe("CREHS PC001 CCSLD");
    expect(item.familia).toBe("PCF - PEÇAS FABRICADAS");
  });

  it("classifica peça (PC) que não termina em SLD como PCA (acabada)", () => {
    const item = resultado.itens.find((i) => i.raw.includes("PC020"))!;
    expect(item.codigo).toBe("CREHS PC020 ACCRT");
    expect(item.familia).toBe("PCA - PEÇAS ACABADAS");
  });

  it("classifica item comprado (COM) como COM - COMPONENTES e preserva hífen embutido na descrição", () => {
    const item = resultado.itens.find((i) => i.raw.includes("P0381"))!;
    expect(item.codigo).toBe("COMDB P0381 018AC");
    expect(item.familia).toBe("COM - COMPONENTES");
    expect(item.descricaoProduto).toBe("COMDB P0381 018AC - DOBRADIÇA DE PINO ROCHA 38,1x18 - 01 AC");
  });

  it("remove a indentação usada como marcação visual de item-filho na BOM", () => {
    const item = resultado.itens.find((i) => i.raw.includes("PC002"))!;
    expect(item.codigo).toBe("CREHS PC002 CTSLD");
  });
});

describe("parseBom — casos de borda", () => {
  it("ignora linhas em branco", () => {
    const r = parseBom([linha(""), linha("   ")]);
    expect(r.itens).toEqual([]);
  });

  it("marca como erro um código fora do padrão de 15 caracteres", () => {
    const r = parseBom([linha("PEÇA SEM PADRÃO NENHUM")]);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0].motivoErro).toMatch(/não bate com o padrão/i);
  });

  it("marca como erro quando a descrição final passaria de 120 caracteres", () => {
    const descricaoGigante = "X".repeat(DESCRICAO_MAX);
    const r = parseBom([linha(`CREHS PC099 CCSLD R00 - ${descricaoGigante}`)]);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0].motivoErro).toMatch(/120/);
  });

  it("considera código já existente como duplicado mesmo se o antigo estiver sem espaço (dedup ignora espaços)", () => {
    const r = parseBom([linha("CREHS SM001 C0PTD R00 - CONJUNTO BASE INF.")], ["CREHSSM001C0PTD"]);
    expect(r.novos).toHaveLength(0);
    expect(r.duplicados).toHaveLength(1);
  });

  it("família não reconhecida (nem COM, nem SM, nem PC) fica com familia=null mas não é erro", () => {
    const r = parseBom([linha("CREHS XX001 C0PTD R00 - ITEM ESTRANHO")]);
    expect(r.itens[0].status).toBe("novo");
    expect(r.itens[0].familia).toBeNull();
  });
});

describe("parseEstrutura — pai/filho pela numeração hierárquica (coluna Nº)", () => {
  const rels = parseEstrutura(BOM_TESTE_ROWS);

  it("gera 13 relações (as linhas cujo Nº tem ponto, ex.: 1.1, 2.3)", () => {
    expect(rels).toHaveLength(13);
  });

  it("liga o filho ao pai certo pelo número (1.1 é filho de 1)", () => {
    const r = rels.find((x) => x.numeroFilho === "1.1")!;
    expect(r.numeroPai).toBe("1");
    expect(r.codigoPai).toBe("CREHS SM001 C0PTD");
    expect(r.codigoFilho).toBe("CREHS PC001 CCSLD");
    expect(r.quantidade).toBe(1);
  });

  it("mantém a quantidade do filho (1.2 tem qtd 4)", () => {
    const r = rels.find((x) => x.numeroFilho === "1.2")!;
    expect(r.codigoFilho).toBe("CREHS PC002 CTSLD");
    expect(r.quantidade).toBe(4);
  });

  it("o mesmo componente sob pais diferentes vira duas relações (dobradiça em 3.1 e 4.2)", () => {
    const dobradica = rels.filter((x) => x.codigoFilho === "COMDB P0381 018AC");
    expect(dobradica).toHaveLength(2);
    expect(dobradica.map((x) => x.numeroPai).sort()).toEqual(["3", "4"]);
  });

  it("itens de topo (Nº sem ponto) não viram filhos", () => {
    expect(rels.some((x) => x.numeroFilho === "7")).toBe(false);
    expect(rels.every((x) => x.numeroFilho.includes("."))).toBe(true);
  });
});

describe("criarEstruturaDaMontagemDestino", () => {
  it("liga apenas os itens de topo à montagem existente e preserva a quantidade", () => {
    const rels = criarEstruturaDaMontagemDestino(BOM_TESTE_ROWS, "MCPDS MT001 C0PTD");

    expect(rels).toHaveLength(37);
    expect(rels[0]).toMatchObject({
      numeroPai: "MONTAGEM_DESTINO",
      numeroFilho: "1",
      codigoPai: "MCPDS MT001 C0PTD",
      codigoFilho: "CREHS SM001 C0PTD",
      quantidade: 1,
    });
    expect(rels.some((rel) => rel.numeroFilho.includes("."))).toBe(false);
  });

  it("não cria auto-referência quando a montagem destino aparece no topo da BOM", () => {
    const rels = criarEstruturaDaMontagemDestino(
      [
        linha("MCPDS MT001 C0PTD R00 - MONTAGEM", { numero: "1" }),
        linha("CREHS SM001 C0PTD R00 - SUBMONTAGEM", { numero: "2" }),
      ],
      "MCPDS MT001 C0PTD",
    );

    expect(rels).toEqual([
      expect.objectContaining({ codigoPai: "MCPDS MT001 C0PTD", codigoFilho: "CREHS SM001 C0PTD" }),
    ]);
  });
});

import { describe, expect, it } from "vitest";

import { DESCRICAO_MAX } from "./bomParser";
import {
  buildEstruturaReview,
  buildProdutoReview,
  estruturaParaEnvio,
  motivoEstrutura,
  motivoProduto,
  produtosParaEnvio,
  produtoValido,
  resumoProdutos,
  type EstruturaReviewItem,
  type ProdutoReviewItem,
} from "./review";
import type { EstruturaRel, ParsedItem } from "./types";

function parsed(overrides: Partial<ParsedItem> = {}): ParsedItem {
  return {
    linha: 6,
    raw: "CREHS PC001 CCSLD R00 - PEÇA",
    codigo: "CREHS PC001 CCSLD",
    descricaoProduto: "CREHS PC001 CCSLD - PEÇA",
    familia: "PCF - PEÇAS FABRICADAS",
    status: "novo",
    ...overrides,
  };
}

function produto(overrides: Partial<ProdutoReviewItem> = {}): ProdutoReviewItem {
  return {
    id: "6-0",
    linha: 6,
    raw: "CREHS PC001 CCSLD R00 - PEÇA",
    codigo: "CREHS PC001 CCSLD",
    descricaoProduto: "CREHS PC001 CCSLD - PEÇA",
    familia: "PCF - PEÇAS FABRICADAS",
    included: true,
    status: "novo",
    ...overrides,
  };
}

function rel(overrides: Partial<EstruturaRel> = {}): EstruturaRel {
  return {
    numeroPai: "1",
    numeroFilho: "1.1",
    codigoPai: "CREHS SM001 C0PTD",
    codigoFilho: "CREHS PC001 CCSLD",
    descricaoFilho: "PEÇA",
    quantidade: 2,
    ...overrides,
  };
}

describe("buildProdutoReview — inclusão padrão", () => {
  it("marca 'novo' e desmarca 'duplicado'/'erro'", () => {
    const itens = buildProdutoReview([
      parsed({ status: "novo" }),
      parsed({ status: "duplicado" }),
      parsed({ status: "erro", codigo: "", descricaoProduto: "", motivoErro: "fora do padrão" }),
    ]);
    expect(itens.map((i) => i.included)).toEqual([true, false, false]);
  });

  it("preserva código/descrição/família e gera ids únicos", () => {
    const itens = buildProdutoReview([parsed(), parsed({ linha: 7 })]);
    expect(itens[0].codigo).toBe("CREHS PC001 CCSLD");
    expect(itens[0].familia).toBe("PCF - PEÇAS FABRICADAS");
    expect(new Set(itens.map((i) => i.id)).size).toBe(2);
  });
});

describe("motivoProduto / produtoValido", () => {
  it("aceita um produto novo bem formado (família null é permitida)", () => {
    expect(motivoProduto(produto())).toBeNull();
    expect(produtoValido(produto({ familia: null }))).toBe(true);
  });

  it("recusa código vazio com a mensagem original do parser", () => {
    const item = produto({ codigo: "", descricaoProduto: "", motivoErro: "fora do padrão" });
    expect(motivoProduto(item)).toBe("fora do padrão");
  });

  it("recusa descrição vazia", () => {
    expect(motivoProduto(produto({ descricaoProduto: "   " }))).toMatch(/informe a descrição/i);
  });

  it("recusa descrição acima do máximo do Omie", () => {
    const item = produto({ descricaoProduto: "X".repeat(DESCRICAO_MAX + 1) });
    expect(motivoProduto(item)).toMatch(new RegExp(String(DESCRICAO_MAX)));
    expect(produtoValido(item)).toBe(false);
  });
});

describe("resumoProdutos", () => {
  it("conta selecionados (incluído+válido), com erro (incluído+inválido) e ignorados", () => {
    const itens = [
      produto({ id: "a", included: true }),
      produto({ id: "b", included: true, descricaoProduto: "" }), // incluído inválido
      produto({ id: "c", included: false }), // ignorado
    ];
    expect(resumoProdutos(itens)).toEqual({ selecionados: 1, comErro: 1, ignorados: 1 });
  });

  it("os três totais somam o total de linhas", () => {
    const itens = buildProdutoReview([
      parsed(),
      parsed({ status: "duplicado" }),
      parsed({ status: "erro", codigo: "", motivoErro: "x" }),
    ]);
    const { selecionados, comErro, ignorados } = resumoProdutos(itens);
    expect(selecionados + comErro + ignorados).toBe(itens.length);
  });
});

describe("produtosParaEnvio", () => {
  it("envia só os incluídos e válidos, sempre como status 'novo' e descrição aparada", () => {
    const itens = [
      produto({ id: "a", descricaoProduto: "  CREHS PC001 CCSLD - PEÇA  " }),
      produto({ id: "b", included: false }),
      produto({ id: "c", descricaoProduto: "" }), // inválido
    ];
    const saida = produtosParaEnvio(itens);
    expect(saida).toHaveLength(1);
    expect(saida[0].status).toBe("novo");
    expect(saida[0].descricaoProduto).toBe("CREHS PC001 CCSLD - PEÇA");
  });

  it("inclui um 'duplicado' re-marcado pelo usuário (envio idempotente)", () => {
    const itens = [produto({ status: "duplicado", included: true })];
    expect(produtosParaEnvio(itens)).toHaveLength(1);
  });
});

describe("estrutura — build, validação e conversão", () => {
  it("build inclui todas as relações por padrão", () => {
    const itens = buildEstruturaReview([rel(), rel({ numeroFilho: "1.2" })]);
    expect(itens.every((i) => i.included)).toBe(true);
    expect(new Set(itens.map((i) => i.id)).size).toBe(2);
  });

  it("quantidade null é válida; negativa é inválida", () => {
    expect(motivoEstrutura(estrutura({ quantidade: null }))).toBeNull();
    expect(motivoEstrutura(estrutura({ quantidade: -1 }))).toMatch(/quantidade/i);
  });

  it("envia só as incluídas e válidas, preservando quantidade (inclusive null)", () => {
    const itens = [
      estrutura({ id: "a", quantidade: 3 }),
      estrutura({ id: "b", quantidade: null }),
      estrutura({ id: "c", quantidade: -2 }), // inválida
      estrutura({ id: "d", included: false }),
    ];
    const saida = estruturaParaEnvio(itens);
    expect(saida).toHaveLength(2);
    expect(saida.map((r) => r.quantidade)).toEqual([3, null]);
  });
});

function estrutura(overrides: Partial<EstruturaReviewItem> = {}): EstruturaReviewItem {
  return {
    id: "1.1-0",
    numeroPai: "1",
    numeroFilho: "1.1",
    codigoPai: "CREHS SM001 C0PTD",
    codigoFilho: "CREHS PC001 CCSLD",
    descricaoFilho: "PEÇA",
    quantidade: 2,
    included: true,
    ...overrides,
  };
}

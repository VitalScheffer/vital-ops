import { describe, expect, it } from "vitest";

import { produtoPorSlug } from "@/lib/configurador/catalogo";
import {
  escolhasPadrao,
  foraDoPadrao,
  montarCodigo,
  normalizarParaCodigo,
  resolverSelecoes,
  resumoTexto,
  type EscolhasBrutas,
} from "@/lib/configurador/codigo";

const maca = produtoPorSlug("maca-padiola")!;

function resolverOuFalhar(escolhas: EscolhasBrutas) {
  const resultado = resolverSelecoes(maca, escolhas);
  if (!resultado.ok) {
    throw new Error(`esperava resolver, veio erro: ${resultado.erro}`);
  }
  return resultado.selecoes;
}

describe("normalizarParaCodigo", () => {
  it("tira espaço e pontuação e sobe para maiúsculo", () => {
    expect(normalizarParaCodigo("2200 x 700 x 850 mm")).toBe("2200X700X850MM");
    expect(normalizarParaCodigo("200 kg")).toBe("200KG");
  });

  it("tira acento em vez de descartar a letra", () => {
    expect(normalizarParaCodigo("três metros")).toBe("TRESMETROS");
    expect(normalizarParaCodigo("ação")).toBe("ACAO");
  });

  it("trunca texto longo para não estourar o código", () => {
    expect(normalizarParaCodigo("a".repeat(40))).toHaveLength(16);
  });
});

describe("catálogo da Maca Padiola", () => {
  it("tem exatamente uma opção padrão por grupo", () => {
    for (const grupo of maca.grupos) {
      const padroes = grupo.opcoes.filter((opcao) => opcao.padrao);
      expect(padroes, `grupo ${grupo.codigo}`).toHaveLength(1);
    }
  });

  it("não repete sigla de grupo nem de opção dentro do grupo", () => {
    const grupos = maca.grupos.map((grupo) => grupo.codigo);
    expect(new Set(grupos).size).toBe(grupos.length);
    for (const grupo of maca.grupos) {
      const opcoes = grupo.opcoes.map((opcao) => opcao.codigo);
      expect(new Set(opcoes).size, `grupo ${grupo.codigo}`).toBe(opcoes.length);
    }
  });
});

describe("resolverSelecoes", () => {
  it("resolve o padrão inteiro sem nenhum desvio", () => {
    const selecoes = resolverOuFalhar(escolhasPadrao(maca));
    expect(selecoes).toHaveLength(maca.grupos.length);
    expect(foraDoPadrao(selecoes)).toHaveLength(0);
  });

  it("cobra escolha de grupo não respondido", () => {
    const escolhas = { ...escolhasPadrao(maca) };
    delete escolhas.ROD;
    const resultado = resolverSelecoes(maca, escolhas);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toContain("Rodízios");
  });

  it("recusa opção que não existe no grupo", () => {
    const resultado = resolverSelecoes(maca, {
      ...escolhasPadrao(maca),
      MAT: { opcao: "TITANIO" },
    });
    expect(resultado.ok).toBe(false);
  });

  it("exige o texto livre quando a opção pede (outro peso)", () => {
    const resultado = resolverSelecoes(maca, {
      ...escolhasPadrao(maca),
      PESO: { opcao: "POUT" },
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toContain("Peso suportado");
  });

  it("ignora texto enviado numa opção que não pede texto", () => {
    const selecoes = resolverOuFalhar({
      ...escolhasPadrao(maca),
      MAT: { opcao: "INOX", texto: "lixo vindo do cliente" },
    });
    const material = selecoes.find((selecao) => selecao.grupoCodigo === "MAT");
    expect(material?.texto).toBeNull();
  });
});

describe("montarCodigo", () => {
  it("gera o código do modelo padrão", () => {
    const selecoes = resolverOuFalhar(escolhasPadrao(maca));
    expect(montarCodigo(maca, selecoes)).toBe(
      "MACA-CARB-DESM-ACOCOL-R3-2CF-GCP-SS0-OX0-P120-M2000",
    );
  });

  it("é determinístico: a ordem de preenchimento não muda o código", () => {
    const base = { ...escolhasPadrao(maca), MAT: { opcao: "INOX" }, ROD: { opcao: "R6" } };
    const invertido: EscolhasBrutas = Object.fromEntries(Object.entries(base).reverse());
    expect(montarCodigo(maca, resolverOuFalhar(base))).toBe(
      montarCodigo(maca, resolverOuFalhar(invertido)),
    );
  });

  it("embute o texto livre normalizado", () => {
    const selecoes = resolverOuFalhar({
      ...escolhasPadrao(maca),
      PESO: { opcao: "POUT", texto: "200 kg" },
    });
    expect(montarCodigo(maca, selecoes)).toContain("POUT200KG");
  });

  it("a mesma medida digitada diferente cai no mesmo código", () => {
    const um = resolverOuFalhar({
      ...escolhasPadrao(maca),
      MED: { opcao: "MOUT", texto: "2200x700x850" },
    });
    const outro = resolverOuFalhar({
      ...escolhasPadrao(maca),
      MED: { opcao: "MOUT", texto: "2200 X 700 X 850" },
    });
    expect(montarCodigo(maca, um)).toBe(montarCodigo(maca, outro));
  });

  it("combinações diferentes geram códigos diferentes", () => {
    const padrao = resolverOuFalhar(escolhasPadrao(maca));
    const inox = resolverOuFalhar({ ...escolhasPadrao(maca), MAT: { opcao: "INOX" } });
    expect(montarCodigo(maca, padrao)).not.toBe(montarCodigo(maca, inox));
  });
});

describe("foraDoPadrao", () => {
  it("lista só o que difere do modelo da foto", () => {
    const selecoes = resolverOuFalhar({
      ...escolhasPadrao(maca),
      MAT: { opcao: "INOX" },
      ROD: { opcao: "R8" },
    });
    const desvios = foraDoPadrao(selecoes);
    expect(desvios.map((desvio) => desvio.grupoCodigo)).toEqual(["MAT", "ROD"]);
  });

  it("conta a opção com texto livre como desvio", () => {
    const selecoes = resolverOuFalhar({
      ...escolhasPadrao(maca),
      PESO: { opcao: "POUT", texto: "200 kg" },
    });
    expect(foraDoPadrao(selecoes)).toHaveLength(1);
  });
});

describe("resumoTexto", () => {
  it("marca o desvio e mostra o texto livre", () => {
    const selecoes = resolverOuFalhar({
      ...escolhasPadrao(maca),
      PESO: { opcao: "POUT", texto: "200 kg" },
    });
    const resumo = resumoTexto(selecoes);
    expect(resumo).toContain("Peso suportado: Outro peso: 200 kg  (fora do padrão)");
    expect(resumo).toContain("Material: Carbono");
  });
});

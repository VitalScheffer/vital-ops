import { describe, expect, it } from "vitest";

import { CATALOGO, fotosDoProduto, produtoPorSlug } from "@/lib/configurador/catalogo";
import { escolhasPadrao, imagemDoProduto, montarCodigo, resolverSelecoes } from "@/lib/configurador/codigo";

// O catálogo é escrito à mão e o formato tem regras que nada valida em tempo de
// execução (o cabeçalho de `catalogo.ts` as documenta). Uma sigla repetida ou um
// grupo sem padrão só apareceria como código errado em produção — e código de
// identidade errado quebra a detecção de configurações repetidas. Daí estes
// testes rodarem sobre o CATÁLOGO inteiro, e não sobre um produto de exemplo.
describe("invariantes do catálogo", () => {
  it("tem slug e sigla únicos entre produtos", () => {
    const slugs = CATALOGO.map((produto) => produto.slug);
    const siglas = CATALOGO.map((produto) => produto.sigla);
    expect(new Set(slugs).size).toBe(CATALOGO.length);
    expect(new Set(siglas).size).toBe(CATALOGO.length);
  });

  it.each(CATALOGO.map((produto) => [produto.nome, produto] as const))(
    "%s: cada grupo tem código único e exatamente uma opção padrão",
    (_nome, produto) => {
      const codigosDeGrupo = produto.grupos.map((grupo) => grupo.codigo);
      expect(new Set(codigosDeGrupo).size).toBe(produto.grupos.length);

      for (const grupo of produto.grupos) {
        const codigosDeOpcao = grupo.opcoes.map((opcao) => opcao.codigo);
        expect(new Set(codigosDeOpcao).size, `opções repetidas em ${grupo.rotulo}`).toBe(
          grupo.opcoes.length,
        );

        const padroes = grupo.opcoes.filter((opcao) => opcao.padrao);
        expect(padroes.length, `${grupo.rotulo} precisa de exatamente uma opção padrão`).toBe(1);
      }
    },
  );

  it.each(CATALOGO.map((produto) => [produto.nome, produto] as const))(
    "%s: o modelo padrão resolve sem erro",
    (_nome, produto) => {
      // Se algum grupo do padrão exigisse texto livre, o formulário abriria já
      // inválido — o vendedor veria o botão desabilitado sem entender por quê.
      const resolucao = resolverSelecoes(produto, escolhasPadrao(produto));
      expect(resolucao.ok, resolucao.ok ? "" : resolucao.erro).toBe(true);
    },
  );
});

describe("imagemDoProduto", () => {
  const carro = produtoPorSlug("carro-emergencia")!;

  it("usa a foto do slim no modelo padrão", () => {
    expect(imagemDoProduto(carro, escolhasPadrao(carro))).toBe(
      "/configurador/carro-emergencia-slim.png",
    );
  });

  it("troca para a foto do grande quando o modelo muda", () => {
    const escolhas = { ...escolhasPadrao(carro), MOD: { opcao: "GRAND" } };
    expect(imagemDoProduto(carro, escolhas)).toBe("/configurador/carro-emergencia-grande.png");
  });

  it("cai na foto do produto quando nenhuma opção tem imagem", () => {
    const maca = produtoPorSlug("maca-padiola")!;
    expect(imagemDoProduto(maca, escolhasPadrao(maca))).toBe(maca.imagem);
  });
});

describe("fotosDoProduto", () => {
  it("dá as fotos das variantes do carro, na ordem do catálogo", () => {
    const carro = produtoPorSlug("carro-emergencia")!;
    expect(fotosDoProduto(carro)).toEqual([
      { src: "/configurador/carro-emergencia-slim.png", rotulo: "Slim" },
      { src: "/configurador/carro-emergencia-grande.png", rotulo: "Grande" },
    ]);
  });

  it("cai na foto do produto quando nenhuma opção tem imagem", () => {
    const maca = produtoPorSlug("maca-padiola")!;
    expect(fotosDoProduto(maca)).toEqual([{ src: maca.imagem, rotulo: maca.nome }]);
  });

  it.each(CATALOGO.map((produto) => [produto.nome, produto] as const))(
    "%s: nunca repete a mesma foto (o carrossel giraria em falso)",
    (_nome, produto) => {
      const fontes = fotosDoProduto(produto).map((foto) => foto.src);
      expect(fontes.length).toBeGreaterThan(0);
      expect(new Set(fontes).size).toBe(fontes.length);
    },
  );
});

describe("código do carro de emergência", () => {
  const carro = produtoPorSlug("carro-emergencia")!;

  it("começa pela sigla do produto e muda quando uma opção muda", () => {
    const resolucaoPadrao = resolverSelecoes(carro, escolhasPadrao(carro));
    const resolucaoInox = resolverSelecoes(carro, {
      ...escolhasPadrao(carro),
      MAT: { opcao: "INOX" },
    });
    if (!resolucaoPadrao.ok || !resolucaoInox.ok) throw new Error("catálogo inválido");

    const codigoPadrao = montarCodigo(carro, resolucaoPadrao.selecoes);
    expect(codigoPadrao.startsWith("CARRO-")).toBe(true);
    expect(montarCodigo(carro, resolucaoInox.selecoes)).not.toBe(codigoPadrao);
  });
});

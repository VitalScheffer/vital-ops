import { describe, expect, it } from "vitest";

import { produtoPorSlug } from "@/lib/configurador/catalogo";
import {
  codificarEscolhas,
  decodificarEscolhas,
  linkDeConferencia,
} from "@/lib/configurador/compartilhar";
import { escolhasPadrao, montarCodigo, resolverSelecoes } from "@/lib/configurador/codigo";

const carro = produtoPorSlug("carro-emergencia")!;
const maca = produtoPorSlug("maca-padiola")!;

function codigoDe(produto: typeof carro, escolhas: Parameters<typeof codificarEscolhas>[1]) {
  const resolucao = resolverSelecoes(produto, escolhas);
  if (!resolucao.ok) throw new Error(resolucao.erro);
  return montarCodigo(produto, resolucao.selecoes);
}

describe("codificarEscolhas", () => {
  it("não escreve nada quando tudo está no padrão", () => {
    expect(codificarEscolhas(carro, escolhasPadrao(carro))).toBe("");
  });

  it("escreve só o que foge do padrão", () => {
    const escolhas = { ...escolhasPadrao(carro), MAT: { opcao: "INOX" }, SOR: { opcao: "SOR0" } };
    expect(codificarEscolhas(carro, escolhas)).toBe("MAT.INOX~SOR.SOR0");
  });

  it("leva junto o texto livre da opção que pede", () => {
    const escolhas = { ...escolhasPadrao(maca), PESO: { opcao: "POUT", texto: "200 kg" } };
    expect(codificarEscolhas(maca, escolhas)).toBe("PESO.POUT.200 kg");
  });
});

describe("ida e volta", () => {
  it("devolve a MESMA configuração, medida pelo código de identidade", () => {
    const escolhas = {
      ...escolhasPadrao(carro),
      MAT: { opcao: "INOX" },
      GAV: { opcao: "G3GAVE" },
      TAB: { opcao: "TAB0" },
      PAR: { opcao: "PARTOT" },
    };
    const voltou = decodificarEscolhas(carro, codificarEscolhas(carro, escolhas));
    expect(codigoDe(carro, voltou)).toBe(codigoDe(carro, escolhas));
  });

  it("preserva medida e peso digitados à mão", () => {
    const escolhas = {
      ...escolhasPadrao(maca),
      PESO: { opcao: "POUT", texto: "200 kg" },
      MED: { opcao: "MOUT", texto: "2200 x 700 x 850 mm" },
    };
    const voltou = decodificarEscolhas(maca, codificarEscolhas(maca, escolhas));
    expect(voltou.PESO).toEqual({ opcao: "POUT", texto: "200 kg" });
    expect(voltou.MED).toEqual({ opcao: "MOUT", texto: "2200 x 700 x 850 mm" });
  });

  it("link sem nada codificado abre o produto no padrão", () => {
    const padrao = escolhasPadrao(carro);
    expect(codigoDe(carro, decodificarEscolhas(carro, ""))).toBe(codigoDe(carro, padrao));
    expect(codigoDe(carro, decodificarEscolhas(carro, null))).toBe(codigoDe(carro, padrao));
  });
});

describe("decodificarEscolhas com URL estragada", () => {
  it("ignora grupo e opção que não existem, em vez de derrubar a tela", () => {
    const escolhas = decodificarEscolhas(carro, "XPTO.NADA~MAT.VOADOR~MAT.INOX~~lixo");
    expect(escolhas.MAT).toEqual({ opcao: "INOX", texto: undefined });
    expect(resolverSelecoes(carro, escolhas).ok).toBe(true);
  });

  it("não deixa texto livre grudar em opção que não pede texto", () => {
    const escolhas = decodificarEscolhas(carro, "MAT.INOX.150 kg");
    expect(escolhas.MAT).toEqual({ opcao: "INOX", texto: undefined });
  });
});

describe("linkDeConferencia", () => {
  it("aponta para a tela pública do produto, com a configuração na URL", () => {
    const escolhas = { ...escolhasPadrao(carro), MAT: { opcao: "INOX" } };
    expect(linkDeConferencia("https://vital-ops.vercel.app", carro, escolhas)).toBe(
      "https://vital-ops.vercel.app/ver/carro-emergencia?c=MAT.INOX",
    );
  });

  it("no padrão, o link é só o produto", () => {
    expect(linkDeConferencia("https://x.com", carro, escolhasPadrao(carro))).toBe(
      "https://x.com/ver/carro-emergencia",
    );
  });

  it("escapa o texto livre para não quebrar a URL", () => {
    const escolhas = { ...escolhasPadrao(maca), MED: { opcao: "MOUT", texto: "2200 x 700 mm" } };
    const link = linkDeConferencia("https://x.com", maca, escolhas);
    expect(link).not.toContain(" ");
    expect(new URL(link).searchParams.get("c")).toBe("MED.MOUT.2200 x 700 mm");
  });
});

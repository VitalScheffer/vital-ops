import { describe, expect, it } from "vitest";

import { produtoPorSlug } from "@/lib/configurador/catalogo";
import { escolhasPadrao, type EscolhasBrutas } from "@/lib/configurador/codigo";
import {
  acabamentoDaPeca,
  estado3d,
  grupoMexeNo3d,
  mudanca,
  mudancas,
} from "@/lib/configurador/modelo3d";

const carro = produtoPorSlug("carro-emergencia")!;
const maca = produtoPorSlug("maca-padiola")!;

function com(mudancas: Record<string, string>): EscolhasBrutas {
  const escolhas = escolhasPadrao(carro);
  for (const [grupo, opcao] of Object.entries(mudancas)) {
    escolhas[grupo] = { opcao };
  }
  return escolhas;
}

describe("estado3d", () => {
  it("no padrão acende todos os acessórios do modelo", () => {
    const estado = estado3d(carro, escolhasPadrao(carro));
    expect([...estado.ocultas]).toEqual([]);
    expect(estado.acabamentoGeral).toBe("pintado");
  });

  it("apaga a peça quando a opção que a acende deixa de estar marcada", () => {
    const estado = estado3d(carro, com({ SOR: "SOR0", DES: "DES0" }));
    expect(estado.ocultas.has("soro")).toBe(true);
    expect(estado.ocultas.has("desfibrilador")).toBe(true);
    expect(estado.ocultas.has("oxigenio")).toBe(false);
  });

  it("não apaga peça que nenhum grupo controla", () => {
    const estado = estado3d(carro, com({ SOR: "SOR0" }));
    for (const peca of ["estrutura", "tampo", "gavetas", "rodizios", "alca"]) {
      expect(estado.ocultas.has(peca)).toBe(false);
    }
  });

  it("troca o acabamento do modelo inteiro no material inox", () => {
    const estado = estado3d(carro, com({ MAT: "INOX" }));
    expect(estado.acabamentoGeral).toBe("inox");
    expect(acabamentoDaPeca(estado, "estrutura")).toBe("inox");
  });

  it("deixa a peça citada ganhar do acabamento geral, nos dois sentidos", () => {
    const soTampo = estado3d(carro, com({ TAM: "TINOX" }));
    expect(acabamentoDaPeca(soTampo, "tampo")).toBe("inox");
    expect(acabamentoDaPeca(soTampo, "estrutura")).toBe("pintado");

    // Carro inox com tampo de carbono: o tampo continua pintado.
    const soEstrutura = estado3d(carro, com({ MAT: "INOX", TAM: "TCARB" }));
    expect(acabamentoDaPeca(soEstrutura, "tampo")).toBe("pintado");
    expect(acabamentoDaPeca(soEstrutura, "estrutura")).toBe("inox");
  });

  it("avisa o que a combinação tem e o modelo não mostra", () => {
    const estado = estado3d(carro, com({ MOD: "GRAND", LIX: "LIX1" }));
    const grupos = estado.avisos.map((aviso) => aviso.grupoRotulo);
    expect(grupos).toContain("Modelo");
    expect(grupos).toContain("Suporte para lixeira");
    expect(estado.avisos.every((aviso) => aviso.texto.length > 0)).toBe(true);
  });

  it("não avisa nada na combinação que o CAD publicado representa", () => {
    const estado = estado3d(carro, com({ GAV: "G3GAVE" }));
    expect(estado.avisos).toEqual([]);
  });

  it("aguenta produto sem modelo 3D e escolhas incompletas", () => {
    expect(estado3d(maca, escolhasPadrao(maca)).avisos).toEqual([]);
    const vazio = estado3d(carro, {});
    // Sem nada marcado, todo grupo controlado apaga suas peças.
    expect(vazio.ocultas.has("soro")).toBe(true);
    expect(vazio.acabamentoGeral).toBe("pintado");
  });
});

describe("mudanca", () => {
  const padrao = estado3d(carro, escolhasPadrao(carro));

  it("aponta a peça que apagou, com o rótulo do grupo e da opção", () => {
    const destaque = mudanca(padrao, estado3d(carro, com({ REG: "REG0" })));
    expect(destaque).toEqual({
      peca: "regua",
      texto: "Régua para tomadas: Não",
      tipo: "apagou",
    });
  });

  it("aponta a peça que acendeu", () => {
    const semSoro = estado3d(carro, com({ SOR: "SOR0" }));
    expect(mudanca(semSoro, padrao)).toEqual({
      peca: "soro",
      texto: "Suporte para soro: Sim",
      tipo: "acendeu",
    });
  });

  it("aponta o modelo inteiro quando o material geral muda", () => {
    expect(mudanca(padrao, estado3d(carro, com({ MAT: "INOX" })))).toEqual({
      peca: null,
      texto: "Material: Inox",
      tipo: "acabamento",
    });
  });

  it("aponta só o tampo quando é ele que troca de acabamento", () => {
    expect(mudanca(padrao, estado3d(carro, com({ TAM: "TINOX" })))).toEqual({
      peca: "tampo",
      texto: "Tampo superior: Inox",
      tipo: "acabamento",
    });
  });

  it("não aponta nada quando a escolha não mexe no modelo", () => {
    expect(mudanca(padrao, estado3d(carro, com({ LIX: "LIX1" })))).toBeNull();
    expect(mudanca(padrao, padrao)).toBeNull();
  });

  it("prefere a peça que sumiu à troca de acabamento, quando as duas mudam", () => {
    const destaque = mudanca(padrao, estado3d(carro, com({ MAT: "INOX", TAB: "TAB0" })));
    expect(destaque?.peca).toBe("tabua");
  });
});

describe("mudancas", () => {
  const padrao = estado3d(carro, escolhasPadrao(carro));

  it("junta tudo que difere do padrão, peça apagada antes de acabamento", () => {
    const atual = estado3d(carro, com({ MAT: "INOX", SOR: "SOR0", REG: "REG0" }));
    expect(mudancas(padrao, atual)).toEqual([
      { peca: "regua", texto: "Régua para tomadas: Não", tipo: "apagou" },
      { peca: "soro", texto: "Suporte para soro: Não", tipo: "apagou" },
      { peca: null, texto: "Material: Inox", tipo: "acabamento" },
    ]);
  });

  it("não aponta nada quando a configuração é a de série", () => {
    expect(mudancas(padrao, padrao)).toEqual([]);
  });

  it("é a mesma lista que `mudanca` usa para escolher a primeira", () => {
    const atual = estado3d(carro, com({ MAT: "INOX", TAB: "TAB0" }));
    expect(mudanca(padrao, atual)).toEqual(mudancas(padrao, atual)[0]);
  });
});

describe("catálogo x modelo 3D", () => {
  it("só cita peça que existe no arquivo", () => {
    const pecas = new Set(carro.modelo3d!.pecas);
    for (const grupo of carro.grupos) {
      for (const opcao of grupo.opcoes) {
        for (const peca of opcao.pecas3d ?? []) {
          expect(pecas, `${grupo.codigo}/${opcao.codigo}`).toContain(peca);
        }
        for (const peca of opcao.acabamento3d?.pecas ?? []) {
          expect(pecas, `${grupo.codigo}/${opcao.codigo}`).toContain(peca);
        }
      }
    }
  });

  it("marca como 3D só os grupos que mudam o modelo", () => {
    const mexem = carro.grupos.filter(grupoMexeNo3d).map((grupo) => grupo.codigo);
    expect(mexem).toEqual(["MAT", "TAM", "TAB", "OXI", "REG", "DES", "SOR"]);
  });

  // O CAD publicado é de UMA configuração: em cada grupo que ele não sabe
  // mudar, só a opção daquele desenho pode ficar sem aviso. Opção nova entra
  // neste teste sozinha e cobra o aviso de quem a cadastrou.
  it("em grupo que o 3D não representa, no máximo uma opção fica sem aviso", () => {
    for (const grupo of carro.grupos) {
      if (grupoMexeNo3d(grupo)) continue;
      const semAviso = grupo.opcoes.filter((opcao) => !opcao.aviso3d);
      expect(semAviso.map((opcao) => opcao.codigo).length, grupo.codigo).toBeLessThanOrEqual(1);
    }
  });
});

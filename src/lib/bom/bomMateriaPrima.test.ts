import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  aplicarCatalogoNaRevisao,
  aplicarEscolhaDeMateriaPrima,
  bomTemMateriaPrima,
  buildMateriaPrimaReview,
  materiaPrimaParaEnvio,
  motivoMateriaPrima,
  resumoMateriaPrima,
} from "@/lib/bom/review";
import { indexarCatalogo, type ItemMat, type ProdutoMatBruto } from "@/lib/produtos/materiaPrima";

import { lerBomDeArquivo } from "./bomFile";
import { NUMERO_RAIZ, orfaosDeEstrutura, parseBom, parseEstrutura } from "./bomParser";
import { montagemDoNomeDoArquivo, normalizarCodigoMontagem } from "./montagem";

// BOM REAL exportada do CAD (a mesma que veio no pedido do Jhonatan): .xls BIFF
// antigo, com as colunas Nº / PEÇA / QTD / Peso / DESCRIÇÃO, e o código da
// montagem só no NOME do arquivo.
const NOME_ARQUIVO = "MSVCH MT001 I0POL.xls";
const CAMINHO = fileURLToPath(new URL("./__fixtures__/bom-msvch-mt001.xls", import.meta.url));
const BYTES = readFileSync(CAMINHO);

function arquivo(): File {
  return new File([BYTES.slice()], NOME_ARQUIVO);
}

// Itens MAT reais do Omie usados por essa BOM.
const CATALOGO = indexarCatalogo([
  { codigo: "MATTB Q2525 12I43", descricao: "MATTB Q2525 12I43 -  TUBO QUADRADO 25x25x1.2 AÇO INOX POLIDO 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTB RD190 15I43", descricao: "MATTB RD190 15I43 - TUBO REDONDO Ø19,05x1,5 AÇO INOX 430 (6000mm)", unidade: "KG" },
  { codigo: "MATTB RD158 12I43", descricao: "MATTB RD158 12I43 - TUBO REDONDO Ø15,88x1,2 AÇO INOX POLIDO 430 (6000mm)", unidade: "KG" },
  { codigo: "MATCH 00090 IN430", descricao: "MATCH 00090 IN430 - CHAPA 0,9 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00120 IN430", descricao: "MATCH 00120 IN430 - CHAPA 1,2 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00150 IN430", descricao: "MATCH 00150 IN430 - CHAPA 1.5 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00200 IN430", descricao: "MATCH 00200 IN430 - CHAPA 2,0 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATCH 00300 IN430", descricao: "MATCH 00300 IN430 - CHAPA ESP 3,00 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATTF RD635 00I43", descricao: "MATTF RD635 00I43 - TREFILADO REDONDO 6,35 AÇO INOX 430 (6000mm)", unidade: "KG" },
] satisfies ProdutoMatBruto[]);

// Segunda BOM REAL, a que o Jhonatan usa como exemplo. Interessa por causa da
// linha "MCPSO PC006 BPCSR R00 - PERFIL DE BORRACHA TIPO U P. TUBO Ø19": o CAD
// exporta ela SEM especificação e SEM peso, porque o perfil não é comprado por
// quilo, e sim por metro (vem em rolo).
const NOME_MCPSO = "MCPSO MT002 I0POL R00.xls";
const BYTES_MCPSO = readFileSync(fileURLToPath(new URL("./__fixtures__/bom-mcpso-mt002.xls", import.meta.url)));

function arquivoMcpso(): File {
  return new File([BYTES_MCPSO.slice()], NOME_MCPSO);
}

// Recorte do catálogo real do Omie com o perfil de borracha em METRO ao lado do
// aço em KG (consultado em 13/08/2026).
const CATALOGO_MCPSO = indexarCatalogo([
  { codigo: "MATTB RD190 15I43", descricao: "MATTB RD190 15I43 - TUBO REDONDO Ø19,05x1,5 AÇO INOX 430 (6000mm)", unidade: "KG" },
  { codigo: "MATCH 00150 IN430", descricao: "MATCH 00150 IN430 - CHAPA 1.5 AÇO INOX 430 (1200x2000)", unidade: "KG" },
  { codigo: "MATPF RA019 BR40P", descricao: "MATPF RA019 BR40P - PERFIL REDONDO ABERTO Ø19,05x4,0 BORRACHA LISA PRETO", unidade: "M" },
] satisfies ProdutoMatBruto[]);

describe("montagemDoNomeDoArquivo", () => {
  it("pega o código da montagem do nome do arquivo da BOM", () => {
    expect(montagemDoNomeDoArquivo(NOME_ARQUIVO)).toBe("MSVCH MT001 I0POL");
  });

  it("aceita o código no meio do nome e com separadores", () => {
    expect(montagemDoNomeDoArquivo("BOM MSVCH MT001 I0POL rev2.xlsx")).toBe("MSVCH MT001 I0POL");
    expect(montagemDoNomeDoArquivo("MSVCH_MT001_I0POL.xls")).toBe("MSVCH MT001 I0POL");
  });

  it("nome sem código no padrão não inventa nada", () => {
    expect(montagemDoNomeDoArquivo("lista de pecas.xlsx")).toBeNull();
  });

  it("código que NÃO é de montagem não pré-preenche nada", () => {
    // Sem essa trava, uma BOM salva com o código de uma PEÇA penduraria a árvore
    // inteira dentro dela, calada, porque o campo já vem preenchido e a
    // conferência no Omie é opcional.
    expect(montagemDoNomeDoArquivo("MSVCH PC010 ICPOL.xls")).toBeNull();
    expect(montagemDoNomeDoArquivo("PROJETO 12345 67890 ABCDE.xls")).toBeNull();
  });

  it("normaliza caixa e espaço sobrando do código digitado", () => {
    expect(normalizarCodigoMontagem("  msvch  mt001   i0pol ")).toBe("MSVCH MT001 I0POL");
  });
});

describe("BOM real MSVCH MT001 I0POL: leitura das colunas novas", () => {
  it("lê Peso e a especificação do material junto com Nº / PEÇA / QTD", async () => {
    const rows = await lerBomDeArquivo(arquivo());
    const pc001 = rows.find((r) => r.peca.includes("PC001"))!;
    expect(pc001.numero).toBe("1.1");
    expect(pc001.quantidade).toBe(1);
    expect(pc001.peso).toBe(1014.52);
    expect(pc001.especificacao).toBe("TUBO QUAD 25,00x25,00x1,20mm");

    // Item comprado não tem peso nem especificação.
    const comprado = rows.find((r) => r.peca.includes("COMBB"))!;
    expect(comprado.peso).toBeNull();
    expect(comprado.especificacao).toBe("");
  });

  it("a submontagem sem o hífen antes da descrição não vira erro nem perde os filhos", async () => {
    // "MSVCH SM004 ITPOL ESTRUTURA SUPERIOR" (sem " - ") existe na BOM real.
    const rows = await lerBomDeArquivo(arquivo());
    const parsed = parseBom(rows);
    expect(parsed.erros).toEqual([]);

    const sm004 = parsed.itens.find((i) => i.raw.includes("SM004"))!;
    expect(sm004.codigo).toBe("MSVCH SM004 ITPOL");
    expect(sm004.descricaoProduto).toBe("MSVCH SM004 ITPOL - ESTRUTURA SUPERIOR");

    expect(orfaosDeEstrutura(rows)).toEqual([]);
    const filhos = parseEstrutura(rows).filter((r) => r.codigoPai === "MSVCH SM004 ITPOL");
    expect(filhos.map((f) => f.numeroFilho)).toEqual(["4.1", "4.2"]);
  });
});

describe("BOM real: montagem de destino como pai da árvore", () => {
  it("sem montagem informada, o nível de topo continua sem pai", async () => {
    const rows = await lerBomDeArquivo(arquivo());
    expect(parseEstrutura(rows).some((r) => r.origem === "raiz")).toBe(false);
  });

  it("com a montagem, cada linha de nível topo vira filha dela com a QTD da linha", async () => {
    const rows = await lerBomDeArquivo(arquivo());
    const rels = parseEstrutura(rows, "MSVCH MT001 I0POL");
    const raiz = rels.filter((r) => r.origem === "raiz");

    // 35 itens de nível topo na BOM (1 a 35).
    expect(raiz).toHaveLength(35);
    expect(raiz.every((r) => r.codigoPai === "MSVCH MT001 I0POL")).toBe(true);
    expect(raiz.every((r) => r.numeroPai === NUMERO_RAIZ)).toBe(true);

    const sm002 = raiz.find((r) => r.numeroFilho === "2")!;
    expect(sm002.codigoFilho).toBe("MSVCH SM002 I0POL");
    expect(sm002.quantidade).toBe(2);

    // As relações internas da BOM continuam iguais.
    expect(rels.filter((r) => r.origem === "bom")).toHaveLength(9);
  });

  it("a própria montagem não vira filha de si mesma", async () => {
    const rows = await lerBomDeArquivo(arquivo());
    // A linha 5 da BOM é a peça MSVCH PC010 ICPOL; usamos ela como raiz de
    // propósito para conferir a proteção contra o auto-relacionamento.
    const rels = parseEstrutura(rows, "MSVCH PC010 ICPOL");
    expect(rels.some((r) => r.codigoPai === r.codigoFilho)).toBe(false);
    expect(rels.filter((r) => r.origem === "raiz")).toHaveLength(34);
  });
});

describe("BOM real: matéria-prima das peças", () => {
  it("resolve a MP das peças em gramas, só marcando o que bate exato", async () => {
    const rows = await lerBomDeArquivo(arquivo());
    const mp = buildMateriaPrimaReview(rows, CATALOGO, "g");

    // Só as PEÇAS entram (submontagem e comprado ficam de fora).
    expect(mp).toHaveLength(18);
    expect(mp.every((i) => i.codigoPeca.includes(" PC"))).toBe(true);

    const pc001 = mp.find((i) => i.codigoPeca === "MSVCH PC001 ITSLD")!;
    expect(pc001.codigoMat).toBe("MATTB Q2525 12I43");
    expect(pc001.quantidade).toBe(1.015); // 1014,52 g
    expect(pc001.confianca).toBe("exata");
    expect(pc001.included).toBe(true);

    const pc002 = mp.find((i) => i.codigoPeca === "MSVCH PC002 ICSLD")!;
    expect(pc002.codigoMat).toBe("MATCH 00300 IN430");
    expect(pc002.quantidade).toBe(0.019); // 19,42 g

    // Trefilado Ø6,25 na BOM x Ø6,35 no cadastro: sugere, mas não marca sozinho.
    const pc017 = mp.find((i) => i.codigoPeca === "MSVCH PC017 IAPOL")!;
    expect(pc017.codigoMat).toBe("MATTF RD635 00I43");
    expect(pc017.confianca).toBe("aproximada");
    expect(pc017.included).toBe(false);
    expect(pc017.motivo).toMatch(/Bitola parecida/);

    expect(resumoMateriaPrima(mp)).toEqual({ selecionadas: 17, pendentes: 1 });
  });

  it("trocar a unidade para kg recalcula todas as quantidades", async () => {
    const rows = await lerBomDeArquivo(arquivo());
    const mp = buildMateriaPrimaReview(rows, CATALOGO, "kg");
    const pc001 = mp.find((i) => i.codigoPeca === "MSVCH PC001 ITSLD")!;
    expect(pc001.quantidade).toBe(1014.52);
  });

  it("sem catálogo, nenhuma peça é marcada e cada uma diz o motivo", async () => {
    const rows = await lerBomDeArquivo(arquivo());
    const mp = buildMateriaPrimaReview(rows, [], "g");
    expect(mp.every((i) => !i.included && i.codigoMat === "")).toBe(true);
    expect(mp[0].motivo).toMatch(/Nenhum item MAT cadastrado no Omie/);
  });

  it("recarregar o catálogo preenche as pendentes sem desfazer a revisão", async () => {
    const rows = await lerBomDeArquivo(arquivo());
    // Estado real de quem está na tela: começou sem catálogo (tudo pendente),
    // resolveu uma peça na mão, esvaziou outra de propósito e ajustou um peso.
    const semCatalogo = buildMateriaPrimaReview(rows, [], "g");
    const emRevisao = semCatalogo.map((item, i) => {
      if (i === 0) return { ...item, codigoMat: "MATCH 00300 IN430", descricaoMat: "escolhida na mão", included: true };
      if (i === 1) return { ...item, motivo: undefined }; // esvaziada de propósito
      if (i === 2) return { ...item, quantidade: 42 };
      return item;
    });

    const comCatalogo = buildMateriaPrimaReview(rows, CATALOGO, "g");
    const depois = aplicarCatalogoNaRevisao(emRevisao, comCatalogo);

    // A escolha manual fica de pé.
    expect(depois[0].codigoMat).toBe("MATCH 00300 IN430");
    expect(depois[0].descricaoMat).toBe("escolhida na mão");
    // A linha esvaziada de propósito continua vazia (é decisão, não pendência).
    expect(depois[1].codigoMat).toBe("");
    // A pendente com peso ajustado recebe a sugestão nova (o peso vem da BOM,
    // então o valor da linha reconstruída é o mesmo).
    expect(depois[2].codigoMat).toBe(comCatalogo[2].codigoMat);
    expect(depois[2].codigoMat).not.toBe("");
    // E o resto pega as sugestões que faltavam.
    expect(depois.filter((i) => i.included).length).toBeGreaterThan(1);
  });

  it("BOM antiga (sem as colunas de peso/especificação) não abre a seção de MP", async () => {
    const rows = (await lerBomDeArquivo(arquivo())).map((r) => ({ ...r, peso: null, especificacao: "" }));
    expect(bomTemMateriaPrima(rows)).toBe(false);
    // Sem isso a tela mostrava uma linha por peça, todas vazias, com o aviso de
    // "N peças sem matéria-prima confirmada" e o seletor sem catálogo nenhum.
    expect(buildMateriaPrimaReview(rows, CATALOGO, "g")).toEqual([]);
  });

  it("peça repetida na BOM entra uma vez só (duplicado conta pro freio do envio)", async () => {
    const rows = await lerBomDeArquivo(arquivo());
    const pc001 = rows.find((r) => r.peca.includes("PC001"))!;
    const comRepetida = [...rows, { ...pc001, linha: 999, numero: "9.9" }];

    const mp = buildMateriaPrimaReview(comRepetida, CATALOGO, "g");
    const doPc001 = mp.filter((i) => i.codigoPeca === "MSVCH PC001 ITSLD");
    expect(doPc001).toHaveLength(2);
    expect(doPc001[1].included).toBe(false);
    expect(doPc001[1].motivo).toMatch(/já aparece antes na BOM/);
    expect(materiaPrimaParaEnvio(mp).filter((r) => r.codigoPai === "MSVCH PC001 ITSLD")).toHaveLength(1);
  });

  it("o peso da BOM não preenche a quantidade de item que não é medido em KG", async () => {
    // Cadastro que LÊ como aço na descrição mas está registrado em METRO. Hoje o
    // casamento automático nunca cai aqui (a descrição do perfil de borracha não
    // parece geometria nenhuma), mas se um dia cair, converter as gramas da BOM
    // mandaria "3,289" METROS de tubo pro Omie no lugar de 3,289 kg.
    const rows = await lerBomDeArquivo(arquivoMcpso());
    const catalogo = indexarCatalogo([
      { codigo: "MATPF RD318 15I43", descricao: "MATPF RD318 15I43 - TUBO REDONDO Ø31,8x1,5 AÇO INOX 430", unidade: "M" },
    ]);

    const pc001 = buildMateriaPrimaReview(rows, catalogo, "g").find(
      (i) => i.codigoPeca === "MCPSO PC001 ITSLD",
    )!;
    expect(pc001.codigoMat).toBe("MATPF RD318 15I43");
    expect(pc001.unidadeMat).toBe("M");
    expect(pc001.quantidade).toBeNull();
    expect(pc001.included).toBe(false);
    expect(pc001.motivo).toMatch(/em M/);
  });

  it("as relações de MP viram estrutura da própria peça, com número único", async () => {
    const rows = await lerBomDeArquivo(arquivo());
    const rels = materiaPrimaParaEnvio(buildMateriaPrimaReview(rows, CATALOGO, "g"));

    expect(rels).toHaveLength(17);
    expect(rels.every((r) => r.origem === "mp")).toBe(true);

    const pc001 = rels.find((r) => r.codigoPai === "MSVCH PC001 ITSLD")!;
    expect(pc001.codigoFilho).toBe("MATTB Q2525 12I43");
    expect(pc001.quantidade).toBe(1.015);
    expect(pc001.numeroFilho).toBe("1.1.MP");

    // O número do filho é a chave do resultado no banco: não pode repetir, nem
    // colidir com a numeração da própria BOM.
    const numeros = rels.map((r) => r.numeroFilho);
    expect(new Set(numeros).size).toBe(numeros.length);
    const daBom = new Set(parseEstrutura(rows, "MSVCH MT001 I0POL").map((r) => r.numeroFilho));
    expect(numeros.some((n) => daBom.has(n))).toBe(false);
  });
});

describe("BOM real MCPSO MT002: perfil de borracha comprado por METRO", () => {
  async function revisao() {
    return buildMateriaPrimaReview(await lerBomDeArquivo(arquivoMcpso()), CATALOGO_MCPSO, "g");
  }

  it("a peça de perfil vira uma pendência que diz o que fazer", async () => {
    const pc006 = (await revisao()).find((i) => i.codigoPeca === "MCPSO PC006 BPCSR")!;

    // O CAD não exporta nem especificação nem peso nessa linha.
    expect(pc006.especificacao).toBe("");
    expect(pc006.pesoBruto).toBeNull();

    expect(pc006.codigoMat).toBe("");
    expect(pc006.unidadeMat).toBe("");
    expect(pc006.quantidade).toBeNull();
    expect(pc006.included).toBe(false);
    // Antes a mensagem só constatava "a linha não traz a especificação", que é
    // um beco sem saída: a BOM nunca vai trazer, o perfil não tem peso útil.
    expect(pc006.motivo).toMatch(/Escolha a matéria-prima e informe a quantidade/);
  });

  it("escolhido o perfil, a validação pede a quantidade em METRO", async () => {
    const pc006 = (await revisao()).find((i) => i.codigoPeca === "MCPSO PC006 BPCSR")!;
    const escolhido = {
      ...pc006,
      codigoMat: "MATPF RA019 BR40P",
      descricaoMat: "MATPF RA019 BR40P - PERFIL REDONDO ABERTO Ø19,05x4,0 BORRACHA LISA PRETO",
      unidadeMat: "M",
      motivo: undefined,
      included: true,
    };

    expect(motivoMateriaPrima(escolhido)).toBe("Informe a quantidade consumida em M.");
    expect(motivoMateriaPrima({ ...escolhido, quantidade: 0.842 })).toBeNull();
    expect(motivoMateriaPrima({ ...escolhido, quantidade: 0 })).toMatch(/maior que zero/);
  });

  it("o metro digitado vai cru pra estrutura da peça", async () => {
    const mp = (await revisao()).map((item) =>
      item.codigoPeca === "MCPSO PC006 BPCSR"
        ? { ...item, codigoMat: "MATPF RA019 BR40P", unidadeMat: "M", quantidade: 0.842, motivo: undefined, included: true }
        : item,
    );

    const rel = materiaPrimaParaEnvio(mp).find((r) => r.codigoPai === "MCPSO PC006 BPCSR")!;
    expect(rel.codigoFilho).toBe("MATPF RA019 BR40P");
    // No Omie a quantidade da estrutura vale na unidade do item FILHO: 0,842 aqui
    // é 0,842 metro de perfil, não quilo.
    expect(rel.quantidade).toBe(0.842);
    expect(rel.numeroFilho).toBe("6.MP");
  });

  it("o aço da mesma BOM continua saindo em KG pelo peso", async () => {
    // "MCPSO PC012 ITPOL - BASE PARACHOQUE", TUBO RED. 19,1x1,5mm, 995 g.
    const pc012 = (await revisao()).find((i) => i.codigoPeca === "MCPSO PC012 ITPOL")!;
    expect(pc012.codigoMat).toBe("MATTB RD190 15I43");
    expect(pc012.unidadeMat).toBe("KG");
    expect(pc012.quantidade).toBe(0.995);
    expect(pc012.included).toBe(true);
  });

  it("a sugestão automática nunca oferece o perfil de borracha para peça de aço", async () => {
    // A garantia real: a descrição do perfil não lê como geometria conhecida,
    // então ele fica fora do casamento e nenhuma peça de aço o recebe.
    const mp = await revisao();
    expect(mp.every((i) => i.codigoMat !== "MATPF RA019 BR40P")).toBe(true);
  });
});

describe("escolher a matéria-prima na mão", () => {
  const MAT_KG: ItemMat = {
    codigo: "MATCH 00300 IN430",
    descricao: "MATCH 00300 IN430 - CHAPA ESP 3,00 AÇO INOX 430 (1200x2000)",
    unidade: "KG",
    espec: null,
    liga: "INOX430",
    ambiguo: false,
  };
  const OUTRO_KG: ItemMat = { ...MAT_KG, codigo: "MATCH 00150 IN430", descricao: "MATCH 00150 IN430 - CHAPA 1.5" };
  const MAT_METRO: ItemMat = {
    codigo: "MATPF RA019 BR40P",
    descricao: "MATPF RA019 BR40P - PERFIL REDONDO ABERTO Ø19,05x4,0 BORRACHA LISA PRETO",
    unidade: "M",
    espec: null,
    liga: null,
    ambiguo: false,
  };

  async function linha(codigoPeca: string) {
    const rows = await lerBomDeArquivo(arquivoMcpso());
    return buildMateriaPrimaReview(rows, CATALOGO_MCPSO, "g").find((i) => i.codigoPeca === codigoPeca)!;
  }

  it("a escolha substitui a sugestão automática (some o motivo e a confiança)", async () => {
    const depois = aplicarEscolhaDeMateriaPrima(await linha("MCPSO PC012 ITPOL"), OUTRO_KG);
    expect(depois.codigoMat).toBe("MATCH 00150 IN430");
    expect(depois.descricaoMat).toBe("MATCH 00150 IN430 - CHAPA 1.5");
    expect(depois.confianca).toBeNull();
    expect(depois.motivo).toBeUndefined();
    expect(depois.included).toBe(true);
  });

  it("trocar entre itens da MESMA unidade preserva a quantidade", async () => {
    const pc012 = await linha("MCPSO PC012 ITPOL"); // já vem com 0,995 kg do peso
    expect(pc012.quantidade).toBe(0.995);
    expect(aplicarEscolhaDeMateriaPrima(pc012, OUTRO_KG).quantidade).toBe(0.995);
  });

  it("trocar de KG para METRO limpa a quantidade", async () => {
    // O erro que isso evita: os 0,995 kg convertidos do peso ficarem no campo e
    // irem pro Omie como 0,995 METRO de perfil de borracha.
    const depois = aplicarEscolhaDeMateriaPrima(await linha("MCPSO PC012 ITPOL"), MAT_METRO);
    expect(depois.unidadeMat).toBe("M");
    expect(depois.quantidade).toBeNull();
    expect(motivoMateriaPrima(depois)).toBe("Informe a quantidade consumida em M.");
  });

  it("escolher o perfil na linha da borracha só aponta a unidade (não havia quantidade)", async () => {
    const depois = aplicarEscolhaDeMateriaPrima(await linha("MCPSO PC006 BPCSR"), MAT_METRO);
    expect(depois.codigoMat).toBe("MATPF RA019 BR40P");
    expect(depois.unidadeMat).toBe("M");
    expect(depois.quantidade).toBeNull();
    expect(depois.included).toBe(true);
  });

  it("esvaziar o seletor desmarca a linha sem jogar fora a quantidade", async () => {
    // Quem esvaziou por engano consegue voltar: o KG que veio do peso da BOM não
    // tem como ser recalculado depois sem reler o arquivo.
    const depois = aplicarEscolhaDeMateriaPrima(await linha("MCPSO PC012 ITPOL"), null);
    expect(depois.codigoMat).toBe("");
    expect(depois.descricaoMat).toBe("");
    expect(depois.included).toBe(false);
    expect(depois.quantidade).toBe(0.995);
    expect(depois.unidadeMat).toBe("KG");
  });
});

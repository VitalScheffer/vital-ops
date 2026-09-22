import { describe, expect, it } from "vitest";

import type { EstruturaRel, Familia, ParsedItem } from "@/lib/bom/types";
import type { OmiePayload } from "@/lib/omie/client";
import { OmieBlocked, OmieCodeConflict, OmieDescriptionConflict, OmieDuplicate, OmieError } from "@/lib/omie/errors";

import { orquestrarEnvio, type ChamarFn } from "./envioOmie";

interface CallRecord {
  path: string;
  call: string;
  param: OmiePayload;
}

type Comportamento = (rec: CallRecord) => OmiePayload | null | Error;

// Mock de `chamar`: registra as chamadas na ordem e devolve/lança o que o
// comportamento definir (Error é lançado para simular OmieDuplicate/Blocked/etc).
function mockChamar(comportamento: Comportamento = () => ({})): { fn: ChamarFn; calls: CallRecord[] } {
  const calls: CallRecord[] = [];
  const fn: ChamarFn = async (path, call, param) => {
    const rec = { path, call, param };
    calls.push(rec);
    const r = comportamento(rec);
    if (r instanceof Error) throw r;
    return r;
  };
  return { fn, calls };
}

function item(
  codigo: string,
  familia: Familia | null,
  status: ParsedItem["status"] = "novo",
): ParsedItem {
  return { linha: 1, raw: codigo, codigo, descricaoProduto: `${codigo} - descrição`, familia, status };
}

function rel(codigoPai: string, codigoFilho: string, quantidade: number | null): EstruturaRel {
  return {
    numeroPai: "1",
    numeroFilho: "1.1",
    codigoPai,
    codigoFilho,
    descricaoFilho: "filho",
    quantidade,
    origem: "bom",
  };
}

function relRevisao(codigoPai: string, codigoFilho: string, quantidade: number, revisao: string) {
  return { ...rel(codigoPai, codigoFilho, quantidade), revisao } as EstruturaRel & { revisao: string };
}

describe("orquestrarEnvio — ordem e mapeamento", () => {
  it("envia na ordem famílias → produtos → estrutura", async () => {
    const { fn, calls } = mockChamar((rec) => (rec.call === "UpsertFamilia" ? { codigo: 5 } : {}));
    const novos = [item("AAAAA SM001 CCCCC", "SBM - SUBMONTAGEM")];
    const estrutura = [rel("AAAAA SM001 CCCCC", "DDDDD PC002 FFSLD", 2)];

    await orquestrarEnvio({ novos, estrutura }, fn);

    // A pré-checagem em lote (ListarProdutos) roda entre as famílias e os produtos.
    expect(calls.map((c) => c.call)).toEqual([
      "UpsertFamilia",
      "ListarProdutos",
      "UpsertProduto",
      "IncluirEstrutura",
    ]);
    expect(calls.map((c) => c.path)).toEqual([
      "geral/familias/",
      "geral/produtos/",
      "geral/produtos/",
      "geral/malha/",
    ]);
  });

  it("garante cada família só uma vez, mesmo com vários produtos", async () => {
    const { fn, calls } = mockChamar((rec) => (rec.call === "UpsertFamilia" ? { codigo: 1 } : {}));
    const novos = [
      item("AAAAA SM001 CCCCC", "SBM - SUBMONTAGEM"),
      item("BBBBB SM002 CCCCC", "SBM - SUBMONTAGEM"),
    ];

    await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(calls.filter((c) => c.call === "UpsertFamilia")).toHaveLength(1);
  });

  it("monta o UpsertFamilia com codInt/codFamilia/nomeFamilia e inativo N", async () => {
    const { fn, calls } = mockChamar(() => ({ codigo: 1 }));
    await orquestrarEnvio({ novos: [item("AAAAA SM001 CCCCC", "SBM - SUBMONTAGEM")], estrutura: [] }, fn);

    const fam = calls.find((c) => c.call === "UpsertFamilia");
    expect(fam?.param).toMatchObject({
      codInt: "SBM",
      codFamilia: "SBM",
      // descrição = rótulo inteiro (igual aparece na seleção), não só "SUBMONTAGEM".
      nomeFamilia: "SBM - SUBMONTAGEM",
      inativo: "N",
    });
  });

  it("grava a descrição = rótulo inteiro para todas as famílias (ex. COM - COMPONENTES)", async () => {
    const { fn, calls } = mockChamar(() => ({ codigo: 1 }));
    await orquestrarEnvio({ novos: [item("COMDB P0381 018AC", "COM - COMPONENTES")], estrutura: [] }, fn);
    const fam = calls.find((c) => c.call === "UpsertFamilia");
    expect(fam?.param).toMatchObject({ codFamilia: "COM", nomeFamilia: "COM - COMPONENTES" });
  });

  it("preenche o UpsertProduto com os fixos, código com/sem espaço e a família resolvida", async () => {
    const { fn, calls } = mockChamar((rec) => (rec.call === "UpsertFamilia" ? { codigo: 777 } : {}));
    await orquestrarEnvio({ novos: [item("AAAAA SM001 CCCCC", "SBM - SUBMONTAGEM")], estrutura: [] }, fn);

    const prod = calls.find((c) => c.call === "UpsertProduto");
    expect(prod?.param).toMatchObject({
      codigo_produto_integracao: "AAAAASM001CCCCC",
      codigo: "AAAAA SM001 CCCCC",
      descricao: "AAAAA SM001 CCCCC - descrição",
      unidade: "UN",
      ncm: "9403.20.90",
      tipoItem: "04",
      produto_lote: "S",
      codigo_familia: 777,
    });
  });

  it("usa o NCM informado (normalizado) nos produtos novos", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    await orquestrarEnvio({ novos: [item("A", null)], estrutura: [], ncm: "94019000" }, fn);
    expect(calls.find((c) => c.call === "UpsertProduto")?.param).toMatchObject({ ncm: "9401.90.00" });
  });

  it("NCM ausente ou inválido cai no padrão 9403.20.90", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    await orquestrarEnvio({ novos: [item("A", null)], estrutura: [], ncm: "999" }, fn);
    expect(calls.find((c) => c.call === "UpsertProduto")?.param).toMatchObject({ ncm: "9403.20.90" });
  });

  it("omite codigo_familia quando o produto não tem família", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    await orquestrarEnvio({ novos: [item("AAAAA XX001 CCCCC", null)], estrutura: [] }, fn);

    const prod = calls.find((c) => c.call === "UpsertProduto");
    expect(prod?.param).not.toHaveProperty("codigo_familia");
    expect(calls.some((c) => c.call === "UpsertFamilia")).toBe(false);
  });

  it("referencia a estrutura pelo código SEM espaço e leva a quantidade", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    const estrutura = [rel("AAAAA SM001 CCCCC", "DDDDD PC002 FFSLD", 3)];
    await orquestrarEnvio({ novos: [], estrutura }, fn);

    const est = calls.find((c) => c.call === "IncluirEstrutura");
    expect(est?.param).toMatchObject({
      intProduto: "AAAAASM001CCCCC",
      itemMalhaIncluir: [
        {
          intProdMalha: "DDDDDPC002FFSLD",
          quantProdMalha: 3,
        },
      ],
    });
  });

  it("grava a revisão na observação quando inclui uma linha nova da estrutura", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    await orquestrarEnvio(
      { novos: [], estrutura: [relRevisao("PAI", "FILHO", 2, "R001")] },
      fn,
    );

    expect(calls.find((c) => c.call === "IncluirEstrutura")?.param).toMatchObject({
      itemMalhaIncluir: [{ quantProdMalha: 2, obsProdMalha: "Revisão R001" }],
    });
  });

  it("preenche o intMalha (obrigatório no Omie) em cada item, dentro do limite de 20 chars", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    await orquestrarEnvio({ novos: [], estrutura: [rel("CREHI SM001 I0POL", "CREHI PC015 ITSLD", 1)] }, fn);
    const item0 = (
      calls.find((c) => c.call === "IncluirEstrutura")?.param.itemMalhaIncluir as Array<{ intMalha: string }>
    )[0];
    expect(item0.intMalha).toBeTruthy();
    expect(item0.intMalha.length).toBeGreaterThan(0);
    expect(item0.intMalha.length).toBeLessThanOrEqual(20);
  });

  it("o intMalha é estável por relação e distinto para a mesma peça em pais diferentes", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    const dobradica = "COMDB P0381 018AC";
    await orquestrarEnvio(
      { novos: [], estrutura: [rel("CREHI SM003 I0POL", dobradica, 2), rel("CREHI SM004 I0POL", dobradica, 2)] },
      fn,
    );
    const malhas = calls
      .filter((c) => c.call === "IncluirEstrutura")
      .map((c) => (c.param.itemMalhaIncluir as Array<{ intMalha: string }>)[0].intMalha);
    // Mesma peça em duas submontagens → intMalha diferente (senão o 2º viraria
    // duplicado e a peça ficaria sem vínculo em uma delas).
    expect(malhas[0]).not.toBe(malhas[1]);
  });

  it("o intMalha é determinístico (mesma relação gera sempre o mesmo valor)", async () => {
    const gerar = async () => {
      const { fn, calls } = mockChamar(() => ({}));
      await orquestrarEnvio({ novos: [], estrutura: [rel("CREHI SM001 I0POL", "CREHI PC015 ITSLD", 1)] }, fn);
      return (calls.find((c) => c.call === "IncluirEstrutura")?.param.itemMalhaIncluir as Array<{ intMalha: string }>)[0]
        .intMalha;
    };
    expect(await gerar()).toBe(await gerar());
  });

  it("pula a relação que JÁ existe no pai com a MESMA quantidade (reenvio sem nenhuma escrita)", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            { codigo: "PAI", codigo_produto: 500 },
            { codigo: "FILHO", codigo_produto: 600 },
          ],
        };
      }
      if (rec.call === "ConsultarEstrutura") {
        return { itens: [{ idMalha: 9001, idProdMalha: 600, codProdMalha: "FILHO", quantProdMalha: 2 }] };
      }
      return {};
    });
    const res = await orquestrarEnvio({ novos: [item("PAI", null)], estrutura: [rel("PAI", "FILHO", 2)] }, fn);
    expect(res.estrutura[0].outcome).toBe("ja_existia");
    expect(calls.filter((c) => c.path === "geral/malha/").map((c) => c.call)).toEqual(["ConsultarEstrutura"]);
    expect(res.remocoes).toEqual([]);
  });

  it("espelho: inclui o filho novo e REMOVE do Omie o que não está mais na BOM", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            { codigo: "PAI", codigo_produto: 500 },
            { codigo: "FILHO", codigo_produto: 600 },
          ],
        };
      }
      if (rec.call === "ConsultarEstrutura") {
        // Outra peça, que saiu da BOM nesta revisão.
        return {
          itens: [{ idMalha: 7, idProdMalha: 999, codProdMalha: "VELHO", descrProdMalha: "PEÇA VELHA", quantProdMalha: 3 }],
        };
      }
      return {};
    });
    const res = await orquestrarEnvio({ novos: [item("PAI", null)], estrutura: [rel("PAI", "FILHO", 2)] }, fn);

    expect(res.estrutura[0].outcome).toBe("enviado");
    // Inclui primeiro, remove depois: se o lote parar no meio, sobra item em vez de faltar.
    expect(calls.filter((c) => c.path === "geral/malha/").map((c) => c.call)).toEqual([
      "ConsultarEstrutura",
      "IncluirEstrutura",
      "ExcluirEstrutura",
    ]);
    expect(calls.find((c) => c.call === "ExcluirEstrutura")?.param).toEqual({ idProduto: 500, idMalha: 7 });
    expect(res.remocoes).toEqual([
      expect.objectContaining({
        codigoPai: "PAI",
        codigoFilho: "VELHO",
        descricaoFilho: "PEÇA VELHA",
        quantidade: 3,
        outcome: "removido",
      }),
    ]);
  });

  it("usa quantidade 1 quando a relação vem sem quantidade", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    await orquestrarEnvio({ novos: [], estrutura: [rel("A", "B", null)] }, fn);
    const est = calls.find((c) => c.call === "IncluirEstrutura");
    const itens = est?.param.itemMalhaIncluir as Array<{ quantProdMalha: number }>;
    expect(itens[0].quantProdMalha).toBe(1);
  });

  it("captura o codigo_produto retornado pelo Omie", async () => {
    const { fn } = mockChamar((rec) => (rec.call === "UpsertProduto" ? { codigo_produto: 42 } : {}));
    const res = await orquestrarEnvio({ novos: [item("A", null)], estrutura: [] }, fn);
    expect(res.produtos[0]).toMatchObject({ outcome: "enviado", omieCodigoProduto: "42" });
  });
});

describe("orquestrarEnvio — duplicados (idempotência)", () => {
  it("trata OmieDuplicate no produto como já existia e segue o lote", async () => {
    const { fn } = mockChamar((rec) =>
      rec.call === "UpsertProduto" && rec.param.codigo === "P1"
        ? new OmieDuplicate("produto já cadastrado")
        : {},
    );
    const novos = [item("P1", null), item("P2", null)];
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(res.produtos[0].outcome).toBe("ja_existia");
    expect(res.produtos[1].outcome).toBe("enviado");
    expect(res.interrompido).toBe(false);
    expect(res.totais).toMatchObject({ enviados: 1, jaExistiam: 1, falhas: 0 });
  });

  it("trata OmieDuplicate na estrutura como já existia", async () => {
    const { fn } = mockChamar((rec) =>
      rec.call === "IncluirEstrutura" ? new OmieDuplicate("estrutura já existe") : {},
    );
    const res = await orquestrarEnvio({ novos: [], estrutura: [rel("A", "B", 1)] }, fn);
    expect(res.estrutura[0].outcome).toBe("ja_existia");
    expect(res.interrompido).toBe(false);
  });

  it("trata OmieDuplicate na família como já existia e ainda envia o produto", async () => {
    const { fn } = mockChamar((rec) =>
      rec.call === "UpsertFamilia" ? new OmieDuplicate("família já existe") : {},
    );
    const res = await orquestrarEnvio(
      { novos: [item("AAAAA XX001 CCCCC", "COM - COMPONENTES")], estrutura: [] },
      fn,
    );
    expect(res.familias[0].outcome).toBe("ja_existia");
    expect(res.produtos[0].outcome).toBe("enviado");
  });
});

describe("orquestrarEnvio — só bloqueio real (OmieBlocked) para o lote", () => {
  it("OmieBlocked no produto interrompe e marca o restante como não enviado", async () => {
    const { fn } = mockChamar((rec) =>
      rec.call === "UpsertProduto" && rec.param.codigo === "P1" ? new OmieBlocked("bloqueado") : {},
    );
    const novos = [item("P1", null), item("P2", null)];
    const estrutura = [rel("P1", "P2", 1)];
    const res = await orquestrarEnvio({ novos, estrutura }, fn);

    expect(res.interrompido).toBe(true);
    expect(res.bloqueado).toBe(true);
    expect(res.produtos[0].outcome).toBe("falha");
    expect(res.produtos[1].outcome).toBe("nao_enviado");
    expect(res.estrutura[0].outcome).toBe("nao_enviado");
    expect(res.motivoInterrupcao).toBe("bloqueado");
  });

  it("OmieError (não classificado) no produto marca falha SÓ daquele item e segue o lote", async () => {
    const { fn } = mockChamar((rec) =>
      rec.call === "UpsertProduto" && rec.param.codigo === "A" ? new OmieError("erro de validação") : {},
    );
    const res = await orquestrarEnvio({ novos: [item("A", null), item("B", null)], estrutura: [] }, fn);

    expect(res.interrompido).toBe(false);
    expect(res.produtos[0].outcome).toBe("falha");
    expect(res.produtos[1].outcome).toBe("enviado");
  });

  it("erro na família (não bloqueio) marca falha na família mas ainda envia o produto", async () => {
    const { fn, calls } = mockChamar((rec) =>
      rec.call === "UpsertFamilia" ? new OmieError("erro na família") : {},
    );
    const res = await orquestrarEnvio(
      { novos: [item("AAAAA XX001 CCCCC", "COM - COMPONENTES")], estrutura: [] },
      fn,
    );

    expect(res.familias[0].outcome).toBe("falha");
    expect(res.interrompido).toBe(false);
    expect(res.produtos[0].outcome).toBe("enviado");
    expect(calls.some((c) => c.call === "UpsertProduto")).toBe(true);
  });

  it("erro genérico na estrutura marca falha só daquela relação e segue as demais", async () => {
    const { fn } = mockChamar((rec) =>
      rec.call === "IncluirEstrutura" && rec.param.intProduto === "A"
        ? new OmieError("erro de validação na estrutura")
        : {},
    );
    const estrutura = [rel("A", "X", 1), rel("B", "Y", 1)];
    const res = await orquestrarEnvio({ novos: [], estrutura }, fn);

    expect(res.interrompido).toBe(false);
    expect(res.estrutura[0].outcome).toBe("falha");
    expect(res.estrutura[1].outcome).toBe("enviado");
  });
});

describe("orquestrarEnvio — descrição já usada por outro código (reaproveita o cadastro existente)", () => {
  const CODIGO_EXISTENTE = "COMDB P0381 018AC";
  const FAULTSTRING_CONFLITO = `ERROR: A descrição informada já está sendo utilizada pelo produto com código ${CODIGO_EXISTENTE}.`;

  it("reaproveita o produto existente (busca por ListarProdutos) e NÃO para o lote", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "UpsertProduto" && rec.param.codigo === "P1") {
        return new OmieDescriptionConflict(FAULTSTRING_CONFLITO);
      }
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            { codigo: CODIGO_EXISTENTE, codigo_produto: 999, codigo_produto_integracao: "COMDBP0381018AC" },
          ],
        };
      }
      return {};
    });
    const novos = [item("P1", null), item("P2", null)];
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(res.produtos[0]).toMatchObject({ outcome: "ja_existia", omieCodigoProduto: "999" });
    expect(res.produtos[1].outcome).toBe("enviado");
    expect(res.interrompido).toBe(false);
    expect(res.totais).toMatchObject({ enviados: 1, jaExistiam: 1, falhas: 0, naoEnviados: 0 });

    // O primeiro ListarProdutos é a pré-checagem em lote; a resolução do conflito
    // (busca pelo código conflitante) é a última.
    const listares = calls.filter((c) => c.call === "ListarProdutos");
    expect(listares.at(-1)?.param).toMatchObject({ produtosPorCodigo: [{ codigo: CODIGO_EXISTENTE }] });
  });

  it("estrutura referencia o ID interno (codigo_produto) do cadastro existente", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "UpsertProduto" && rec.param.codigo === "P1") {
        return new OmieDescriptionConflict(FAULTSTRING_CONFLITO);
      }
      if (rec.call === "ListarProdutos") {
        return { produto_servico_cadastro: [{ codigo_produto: 999, codigo_produto_integracao: "COMDBP0381018AC" }] };
      }
      return {};
    });
    await orquestrarEnvio({ novos: [item("P1", null)], estrutura: [rel("P1", "FILHO1", 2)] }, fn);

    const est = calls.find((c) => c.call === "IncluirEstrutura");
    expect(est?.param).toMatchObject({ idProduto: 999 });
  });

  it("se não achar o cadastro existente, marca falha (não assume sucesso) e segue o lote", async () => {
    const { fn } = mockChamar((rec) => {
      if (rec.call === "UpsertProduto" && rec.param.codigo === "P1") {
        return new OmieDescriptionConflict(FAULTSTRING_CONFLITO);
      }
      if (rec.call === "ListarProdutos") return null; // não encontrado
      return {};
    });
    const novos = [item("P1", null), item("P2", null)];
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(res.produtos[0].outcome).toBe("falha");
    expect(res.produtos[0].motivo).toContain("confira manualmente");
    expect(res.produtos[1].outcome).toBe("enviado");
    expect(res.interrompido).toBe(false);
  });

  it("se a busca do cadastro existente vier bloqueada pelo Omie, para o lote (ban-safety)", async () => {
    const { fn } = mockChamar((rec) => {
      if (rec.call === "UpsertProduto" && rec.param.codigo === "P1") {
        return new OmieDescriptionConflict(FAULTSTRING_CONFLITO);
      }
      if (rec.call === "ListarProdutos") {
        // Só a busca de RESOLUÇÃO (pelo código conflitante) bloqueia; a
        // pré-checagem em lote (pelos códigos P1/P2) passa vazia.
        const codigos = (rec.param.produtosPorCodigo as Array<{ codigo: string }> | undefined)?.map(
          (p) => p.codigo,
        );
        if (codigos?.includes(CODIGO_EXISTENTE)) return new OmieBlocked("bloqueado");
        return {};
      }
      return {};
    });
    const novos = [item("P1", null), item("P2", null)];
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(res.produtos[0].outcome).toBe("falha");
    expect(res.interrompido).toBe(true);
    expect(res.bloqueado).toBe(true);
    expect(res.produtos[1].outcome).toBe("nao_enviado");
  });
});

describe("orquestrarEnvio — código já usado por outro id (reaproveita o cadastro existente)", () => {
  const ID_EXISTENTE = "12123048648";
  const FAULTSTRING_CONFLITO = `ERROR: O código CREHI PC021 ITSLD informado já está sendo utilizado pelo produto com ID ${ID_EXISTENTE}.`;

  it("reaproveita o produto existente (busca por ConsultarProduto/codigo_produto) e NÃO para o lote", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "UpsertProduto" && rec.param.codigo === "P1") {
        return new OmieCodeConflict(FAULTSTRING_CONFLITO);
      }
      if (rec.call === "ConsultarProduto") {
        return { codigo_produto: Number(ID_EXISTENTE), codigo_produto_integracao: "CREHIPC021ITSLD" };
      }
      return {};
    });
    const novos = [item("P1", null), item("P2", null)];
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(res.produtos[0]).toMatchObject({ outcome: "ja_existia", omieCodigoProduto: ID_EXISTENTE });
    expect(res.produtos[1].outcome).toBe("enviado");
    expect(res.interrompido).toBe(false);
    expect(res.totais).toMatchObject({ enviados: 1, jaExistiam: 1, falhas: 0, naoEnviados: 0 });

    const consultar = calls.find((c) => c.call === "ConsultarProduto");
    expect(consultar?.param).toMatchObject({ codigo_produto: Number(ID_EXISTENTE) });
  });

  it("estrutura referencia o ID interno (codigo_produto) do cadastro existente", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "UpsertProduto" && rec.param.codigo === "P1") {
        return new OmieCodeConflict(FAULTSTRING_CONFLITO);
      }
      if (rec.call === "ConsultarProduto") {
        return { codigo_produto: Number(ID_EXISTENTE), codigo_produto_integracao: "CREHIPC021ITSLD" };
      }
      return {};
    });
    await orquestrarEnvio({ novos: [item("P1", null)], estrutura: [rel("P1", "FILHO1", 2)] }, fn);

    const est = calls.find((c) => c.call === "IncluirEstrutura");
    expect(est?.param).toMatchObject({ idProduto: Number(ID_EXISTENTE) });
  });

  it("se não achar o cadastro existente, marca falha (não assume sucesso) e segue o lote", async () => {
    const { fn } = mockChamar((rec) => {
      if (rec.call === "UpsertProduto" && rec.param.codigo === "P1") {
        return new OmieCodeConflict(FAULTSTRING_CONFLITO);
      }
      if (rec.call === "ConsultarProduto") return null; // não encontrado
      return {};
    });
    const novos = [item("P1", null), item("P2", null)];
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(res.produtos[0].outcome).toBe("falha");
    expect(res.produtos[0].motivo).toContain("confira manualmente");
    expect(res.produtos[1].outcome).toBe("enviado");
    expect(res.interrompido).toBe(false);
  });

  it("se a busca do cadastro existente vier bloqueada pelo Omie, para o lote (ban-safety)", async () => {
    const { fn } = mockChamar((rec) => {
      if (rec.call === "UpsertProduto" && rec.param.codigo === "P1") {
        return new OmieCodeConflict(FAULTSTRING_CONFLITO);
      }
      if (rec.call === "ConsultarProduto") return new OmieBlocked("bloqueado");
      return {};
    });
    const novos = [item("P1", null), item("P2", null)];
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(res.produtos[0].outcome).toBe("falha");
    expect(res.interrompido).toBe(true);
    expect(res.bloqueado).toBe(true);
    expect(res.produtos[1].outcome).toBe("nao_enviado");
  });
});

describe("orquestrarEnvio — freio de segurança (sequência sem sucesso limpo pausa o envio)", () => {
  it("pausa o lote após N respostas seguidas fora do sucesso limpo, sem marcar como bloqueio real", async () => {
    const { fn } = mockChamar((rec) =>
      rec.call === "UpsertProduto" ? new OmieDuplicate("já cadastrado") : {},
    );
    const novos = Array.from({ length: 6 }, (_, i) => item(`P${i + 1}`, null));
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(res.interrompido).toBe(true);
    expect(res.bloqueado).toBe(false);
    expect(res.motivoInterrupcao).toContain("pausado por segurança");
    expect(res.produtos.slice(0, 5).every((p) => p.outcome === "ja_existia")).toBe(true);
    expect(res.produtos[5].outcome).toBe("nao_enviado");
  });

  it("um sucesso no meio reseta a sequência e o envio não pausa", async () => {
    let contador = 0;
    const { fn } = mockChamar((rec) => {
      if (rec.call !== "UpsertProduto") return {};
      contador += 1;
      return contador % 5 === 0 ? {} : new OmieDuplicate("já cadastrado");
    });
    const novos = Array.from({ length: 9 }, (_, i) => item(`P${i + 1}`, null));
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(res.interrompido).toBe(false);
    expect(res.produtos).toHaveLength(9);
  });

  it("a sequência é compartilhada entre família e produto", async () => {
    const { fn } = mockChamar((rec) => {
      if (rec.call === "UpsertFamilia") return new OmieError("erro na família");
      if (rec.call === "UpsertProduto") return new OmieDuplicate("já cadastrado");
      return {};
    });
    const novos = [
      item("AAAAA XX001 CCCCC", "COM - COMPONENTES"),
      item("BBBBB XX002 CCCCC", "SBM - SUBMONTAGEM"),
      item("CCCCC XX003 CCCCC", "PCF - PEÇAS FABRICADAS"),
      item("P4", null),
      item("P5", null),
    ];
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    // 3 famílias com falha (sequência 1-3) + 2 produtos duplicados (4-5) → pausa no 5º.
    expect(res.interrompido).toBe(true);
    expect(res.bloqueado).toBe(false);
    expect(res.produtos[2].outcome).toBe("nao_enviado");
  });
});

describe("orquestrarEnvio — pré-checagem pula o que já existe (evita conflito/bloqueio)", () => {
  it("pula o UpsertProduto de quem já existe no Omie e marca como já existia", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            { codigo: "P1", codigo_produto: 111, codigo_produto_integracao: "P1INT" },
          ],
        };
      }
      return {};
    });
    const res = await orquestrarEnvio({ novos: [item("P1", null), item("P2", null)], estrutura: [] }, fn);

    // P1 já existia → nenhum UpsertProduto pra ele; só P2 (novo de verdade) é enviado.
    const upserts = calls.filter((c) => c.call === "UpsertProduto").map((c) => c.param.codigo);
    expect(upserts).toEqual(["P2"]);
    expect(res.produtos[0]).toMatchObject({ codigo: "P1", outcome: "ja_existia", omieCodigoProduto: "111" });
    expect(res.produtos[1].outcome).toBe("enviado");
    expect(res.interrompido).toBe(false);
  });

  it("estrutura de produto pré-existente usa o ID interno (idProduto/idProdMalha), sem Upsert", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            { codigo: "PAI", codigo_produto: 500, codigo_produto_integracao: "" },
            { codigo: "FILHO", codigo_produto: 600, codigo_produto_integracao: "" },
          ],
        };
      }
      return {};
    });
    const res = await orquestrarEnvio(
      { novos: [item("PAI", null)], estrutura: [rel("PAI", "FILHO", 2)] },
      fn,
    );

    const est = calls.find((c) => c.call === "IncluirEstrutura");
    expect(est?.param).toMatchObject({
      idProduto: 500,
      itemMalhaIncluir: [{ idProdMalha: 600, quantProdMalha: 2 }],
    });
    expect(calls.some((c) => c.call === "UpsertProduto")).toBe(false); // PAI já existia → pulado
    expect(res.produtos[0].outcome).toBe("ja_existia");
  });

  it("muitos produtos já existentes NÃO pausam o lote (skip não conta pro freio)", async () => {
    const codigos = Array.from({ length: 8 }, (_, i) => `E${i + 1}`);
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: codigos.map((c, i) => ({
            codigo: c,
            codigo_produto: 1000 + i,
            codigo_produto_integracao: `${c}INT`,
          })),
        };
      }
      return {};
    });
    const res = await orquestrarEnvio({ novos: codigos.map((c) => item(c, null)), estrutura: [] }, fn);

    // 8 já existentes seguidos passariam do limite do freio (5) se contassem — mas
    // skip não tem chamada ao Omie, então não conta e o lote não pausa.
    expect(res.interrompido).toBe(false);
    expect(res.produtos.every((p) => p.outcome === "ja_existia")).toBe(true);
    expect(calls.some((c) => c.call === "UpsertProduto")).toBe(false);
  });

  it("falha na leitura da pré-checagem não interrompe: cai no Upsert normal", async () => {
    const { fn, calls } = mockChamar((rec) =>
      rec.call === "ListarProdutos" ? new OmieError("erro na leitura") : {},
    );
    const res = await orquestrarEnvio({ novos: [item("P1", null)], estrutura: [] }, fn);

    expect(res.interrompido).toBe(false);
    expect(res.produtos[0].outcome).toBe("enviado");
    expect(calls.some((c) => c.call === "UpsertProduto")).toBe(true);
  });

  it("bloqueio real na pré-checagem para o lote (ban-safety)", async () => {
    const { fn } = mockChamar((rec) =>
      rec.call === "ListarProdutos" ? new OmieBlocked("bloqueado") : {},
    );
    const res = await orquestrarEnvio({ novos: [item("P1", null), item("P2", null)], estrutura: [] }, fn);

    expect(res.interrompido).toBe(true);
    expect(res.bloqueado).toBe(true);
    expect(res.produtos.every((p) => p.outcome === "nao_enviado")).toBe(true);
  });
});

describe("orquestrarEnvio — montagem de destino (origem 'raiz')", () => {
  function relRaiz(codigoMontagem: string, codigoFilho: string): EstruturaRel {
    return {
      numeroPai: "0",
      numeroFilho: "1",
      codigoPai: codigoMontagem,
      codigoFilho,
      descricaoFilho: "filho",
      quantidade: 1,
      origem: "raiz",
    };
  }

  it("montagem que não existe no Omie falha SEM gastar escrita (é o que queima o ban)", async () => {
    // ListarProdutos responde certinho e não acha nada: dá pra afirmar que a
    // montagem não está cadastrada.
    const { fn, calls } = mockChamar(() => ({}));
    const res = await orquestrarEnvio(
      {
        novos: [item("AAAAA SM001 CCCCC", "SBM - SUBMONTAGEM")],
        estrutura: [relRaiz("XXXXX MT999 ZZZZZ", "AAAAA SM001 CCCCC")],
      },
      fn,
    );

    expect(calls.filter((c) => c.call === "IncluirEstrutura")).toHaveLength(0);
    expect(res.estrutura[0].outcome).toBe("falha");
    expect(res.estrutura[0].motivo).toMatch(/XXXXX MT999 ZZZZZ.*não está cadastrada/);
    // Falha local não conta pro freio: ela não gerou resposta ruim do Omie.
    expect(res.interrompido).toBe(false);
  });

  it("montagem já cadastrada é usada como pai pelo ID interno do Omie", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            { codigo: "XXXXX MT999 ZZZZZ", codigo_produto: 777 },
            { codigo: "AAAAA SM001 CCCCC", codigo_produto: 888 },
          ],
        };
      }
      if (rec.call === "ConsultarEstrutura") return { itens: [] };
      return {};
    });

    const res = await orquestrarEnvio(
      {
        novos: [item("AAAAA SM001 CCCCC", "SBM - SUBMONTAGEM")],
        estrutura: [relRaiz("XXXXX MT999 ZZZZZ", "AAAAA SM001 CCCCC")],
      },
      fn,
    );

    const inclusao = calls.find((c) => c.call === "IncluirEstrutura");
    expect(inclusao?.param).toMatchObject({ idProduto: 777 });
    expect(res.estrutura[0].outcome).toBe("enviado");
  });

  it("diferença só de caixa no que foi digitado não vira acusação de inexistente", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return { produto_servico_cadastro: [{ codigo: "XXXXX MT999 ZZZZZ", codigo_produto: 777 }] };
      }
      if (rec.call === "ConsultarEstrutura") return { itens: [] };
      return {};
    });

    const res = await orquestrarEnvio(
      {
        novos: [item("AAAAA SM001 CCCCC", "SBM - SUBMONTAGEM")],
        estrutura: [relRaiz("xxxxx mt999 zzzzz", "AAAAA SM001 CCCCC")],
      },
      fn,
    );

    expect(res.estrutura[0].motivo ?? "").not.toMatch(/não está cadastrada/);
    expect(calls.filter((c) => c.call === "IncluirEstrutura")).toHaveLength(1);
  });

  it("a falha local da montagem NÃO desarma o freio das escritas de verdade", async () => {
    // Montagem errada intercalada com relações que falham no Omie: se a falha
    // local zerasse a sequência, o freio nunca chegaria ao limite e o lote
    // seguiria martelando o Omie — que é justamente o risco de bloqueio.
    const { fn } = mockChamar((rec) => {
      if (rec.call === "IncluirEstrutura") return new OmieError("recusado", {});
      return {};
    });

    const estrutura: EstruturaRel[] = [];
    for (let i = 0; i < 5; i++) {
      estrutura.push(relRaiz("XXXXX MT999 ZZZZZ", `FILH${i} PC001 CCSLD`));
      estrutura.push(rel(`PAI${i}0 SM001 CCCCC`, `FILH${i} PC001 CCSLD`, 1));
    }

    const res = await orquestrarEnvio({ novos: [], estrutura }, fn);

    expect(res.interrompido).toBe(true);
    expect(res.bloqueado).toBe(false); // freio nosso, não bloqueio do Omie
  });

  it("pré-checagem falhando NÃO acusa a montagem de não existir", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") return new OmieError("instabilidade", { retryable: true });
      return {};
    });

    const res = await orquestrarEnvio(
      {
        novos: [item("AAAAA SM001 CCCCC", "SBM - SUBMONTAGEM")],
        estrutura: [relRaiz("XXXXX MT999 ZZZZZ", "AAAAA SM001 CCCCC")],
      },
      fn,
    );

    // Sem saber, tenta o caminho normal em vez de culpar o código do usuário.
    expect(calls.filter((c) => c.call === "IncluirEstrutura")).toHaveLength(1);
    expect(res.estrutura[0].motivo ?? "").not.toMatch(/não está cadastrada/);
  });
});

describe("orquestrarEnvio — pré-checagem de estrutura não queima o breaker", () => {
  it("não consulta a malha de produto que ACABOU de ser criado (só volta vazio)", async () => {
    const { fn, calls } = mockChamar((rec) =>
      rec.call === "UpsertProduto" ? { codigo_produto: 42 } : {},
    );

    await orquestrarEnvio(
      {
        novos: [item("AAAAA SM001 CCCCC", "SBM - SUBMONTAGEM"), item("BBBBB PC001 CCSLD", null)],
        estrutura: [rel("AAAAA SM001 CCCCC", "BBBBB PC001 CCSLD", 1)],
      },
      fn,
    );

    expect(calls.filter((c) => c.call === "ConsultarEstrutura")).toHaveLength(0);
  });

  it("desiste da pré-checagem depois de alguns pais sem malha nenhuma", async () => {
    // 10 pais que já existiam no Omie e ainda não têm estrutura: cada consulta
    // vazia conta fault no breaker, então a pré-checagem para antes de estourar.
    const pais = Array.from({ length: 10 }, (_, i) => `PAI${i}0 SM001 CCCCC`);
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            ...pais.map((codigo, i) => ({ codigo, codigo_produto: 100 + i })),
            { codigo: "BBBBB PC001 CCSLD", codigo_produto: 999 },
          ],
        };
      }
      if (rec.call === "ConsultarEstrutura") return null; // sem malha
      return {};
    });

    await orquestrarEnvio(
      {
        novos: [],
        estrutura: pais.map((pai) => rel(pai, "BBBBB PC001 CCSLD", 1)),
      },
      fn,
    );

    expect(calls.filter((c) => c.call === "ConsultarEstrutura").length).toBeLessThanOrEqual(3);
  });

  it("avisa quais pais ficaram sem conferência depois que a leitura pausou", async () => {
    const pais = Array.from({ length: 5 }, (_, i) => `PAI${i}0 SM001 CCCCC`);
    const { fn } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            ...pais.map((codigo, i) => ({ codigo, codigo_produto: 100 + i })),
            { codigo: "BBBBB PC001 CCSLD", codigo_produto: 999 },
          ],
        };
      }
      if (rec.call === "ConsultarEstrutura") return null;
      return {};
    });

    const res = await orquestrarEnvio({ novos: [], estrutura: pais.map((pai) => rel(pai, "BBBBB PC001 CCSLD", 1)) }, fn);

    // Os 3 primeiros foram lidos (vazios); os 2 últimos não, e a tela precisa dizer.
    expect(res.paisNaoConferidos).toEqual([pais[3], pais[4]]);
    // Os filhos ainda entram (pai sem estrutura é o caso comum aqui).
    expect(res.estrutura.every((r) => r.outcome === "enviado")).toBe(true);
  });
});

describe("orquestrarEnvio — sobrescreve a estrutura que já existe no Omie", () => {
  const PRODUTOS = {
    produto_servico_cadastro: [
      { codigo: "PAI", codigo_produto: 500 },
      { codigo: "FILHO", codigo_produto: 600 },
      { codigo: "OUTRO", codigo_produto: 700 },
    ],
  };

  function comEstrutura(itens: OmiePayload[], extra: Comportamento = () => ({})) {
    return mockChamar((rec) => {
      if (rec.call === "ListarProdutos") return PRODUTOS;
      if (rec.call === "ConsultarEstrutura") return { itens };
      return extra(rec);
    });
  }

  it("quantidade diferente vira AlterarEstrutura na linha que já existe (não inclui outra)", async () => {
    const { fn, calls } = comEstrutura([
      { idMalha: 9001, idProdMalha: 600, codProdMalha: "FILHO", quantProdMalha: 1, percPerdaProdMalha: 5, obsProdMalha: "corte a laser" },
    ]);

    const res = await orquestrarEnvio({ novos: [], estrutura: [rel("PAI", "FILHO", 4)] }, fn);

    expect(calls.some((c) => c.call === "IncluirEstrutura")).toBe(false);
    expect(calls.find((c) => c.call === "AlterarEstrutura")?.param).toEqual({
      idProduto: 500,
      // Perda e observação que alguém pôs à mão no Omie são mantidas.
      itemMalhaAlterar: [
        { idMalha: 9001, idProdMalha: 600, quantProdMalha: 4, percPerdaProdMalha: 5, obsProdMalha: "corte a laser" },
      ],
    });
    expect(res.estrutura[0]).toMatchObject({ outcome: "atualizado" });
    expect(res.estrutura[0].detalhe).toMatch(/1.*→.*4/);
    expect(res.interrompido).toBe(false);
  });

  it("atualiza a observação de revisão mesmo quando a quantidade continua igual", async () => {
    const { fn, calls } = comEstrutura([
      {
        idMalha: 9001,
        idProdMalha: 600,
        codProdMalha: "FILHO",
        quantProdMalha: 4,
        obsProdMalha: "Revisão R000 · corte a laser",
      },
    ]);

    await orquestrarEnvio(
      { novos: [], estrutura: [relRevisao("PAI", "FILHO", 4, "R001")] },
      fn,
    );

    expect(calls.find((c) => c.call === "AlterarEstrutura")?.param).toMatchObject({
      itemMalhaAlterar: [{ idMalha: 9001, quantProdMalha: 4, obsProdMalha: "Revisão R001 · corte a laser" }],
    });
  });

  it("casa pelo CÓDIGO quando o id do filho não é conhecido (não duplica a linha)", async () => {
    // Pré-checagem não trouxe o filho: só o código da linha do Omie identifica.
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") return { produto_servico_cadastro: [{ codigo: "PAI", codigo_produto: 500 }] };
      if (rec.call === "ConsultarEstrutura") {
        return { itens: [{ idMalha: 9001, idProdMalha: 612, codProdMalha: "CREHI PC015 ITSLD", quantProdMalha: 1 }] };
      }
      return {};
    });

    const res = await orquestrarEnvio({ novos: [], estrutura: [rel("PAI", "CREHI PC015 ITSLD", 3)] }, fn);

    expect(calls.some((c) => c.call === "IncluirEstrutura")).toBe(false);
    expect(calls.some((c) => c.call === "ExcluirEstrutura")).toBe(false);
    expect(calls.find((c) => c.call === "AlterarEstrutura")?.param).toMatchObject({
      itemMalhaAlterar: [{ idMalha: 9001, quantProdMalha: 3 }],
    });
    expect(res.estrutura[0].outcome).toBe("atualizado");
  });

  it("a mesma peça repetida sob o MESMO pai soma numa linha só", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    const estrutura: EstruturaRel[] = [
      { ...rel("PAI", "PARAFUSO", 2), numeroPai: "1", numeroFilho: "1.1" },
      { ...rel("PAI", "PARAFUSO", 3), numeroPai: "1", numeroFilho: "1.4" },
    ];

    const res = await orquestrarEnvio({ novos: [], estrutura }, fn);

    const inclusoes = calls.filter((c) => c.call === "IncluirEstrutura");
    expect(inclusoes).toHaveLength(1);
    expect(inclusoes[0].param).toMatchObject({ itemMalhaIncluir: [{ quantProdMalha: 5 }] });
    expect(res.estrutura.map((r) => r.outcome)).toEqual(["enviado", "enviado"]);
  });

  it("submontagem repetida em dois lugares da BOM não soma nem duplica os filhos dela", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    const estrutura: EstruturaRel[] = [
      { ...rel("SM", "PECA", 2), numeroPai: "1", numeroFilho: "1.1" },
      { ...rel("SM", "PECA", 2), numeroPai: "3", numeroFilho: "3.1" },
    ];

    await orquestrarEnvio({ novos: [], estrutura }, fn);

    const inclusoes = calls.filter((c) => c.call === "IncluirEstrutura");
    expect(inclusoes).toHaveLength(1);
    expect(inclusoes[0].param).toMatchObject({ itemMalhaIncluir: [{ quantProdMalha: 2 }] });
  });

  it("linha repetida da mesma peça no Omie: mantém uma e remove a sobra", async () => {
    const { fn, calls } = comEstrutura([
      { idMalha: 1, idProdMalha: 600, codProdMalha: "FILHO", quantProdMalha: 2 },
      { idMalha: 2, idProdMalha: 600, codProdMalha: "FILHO", quantProdMalha: 2 },
    ]);

    const res = await orquestrarEnvio({ novos: [], estrutura: [rel("PAI", "FILHO", 2)] }, fn);

    expect(res.estrutura[0].outcome).toBe("ja_existia");
    expect(calls.filter((c) => c.call === "ExcluirEstrutura").map((c) => c.param.idMalha)).toEqual([2]);
    expect(res.remocoes.map((r) => r.outcome)).toEqual(["removido"]);
  });

  it("não conseguiu ler a estrutura atual: não remove nada e avisa que o pai não foi conferido", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") return PRODUTOS;
      if (rec.call === "ConsultarEstrutura") return new OmieError("instabilidade", { retryable: true });
      return {};
    });

    const res = await orquestrarEnvio({ novos: [], estrutura: [rel("PAI", "FILHO", 2)] }, fn);

    expect(calls.some((c) => c.call === "ExcluirEstrutura")).toBe(false);
    expect(calls.some((c) => c.call === "AlterarEstrutura")).toBe(false);
    // Cai no caminho antigo (inclui e trata duplicado) pra não travar o envio.
    expect(calls.some((c) => c.call === "IncluirEstrutura")).toBe(true);
    expect(res.paisNaoConferidos).toEqual(["PAI"]);
    expect(res.interrompido).toBe(false);
  });

  it("falha ao remover marca só aquela remoção e não assume que saiu", async () => {
    const { fn } = comEstrutura([{ idMalha: 7, idProdMalha: 700, codProdMalha: "OUTRO", quantProdMalha: 1 }], (rec) =>
      rec.call === "ExcluirEstrutura" ? new OmieError("não pode excluir: item usado em OP") : {},
    );

    const res = await orquestrarEnvio({ novos: [], estrutura: [rel("PAI", "FILHO", 1)] }, fn);

    expect(res.estrutura[0].outcome).toBe("enviado");
    expect(res.remocoes).toEqual([
      expect.objectContaining({ codigoFilho: "OUTRO", outcome: "falha", motivo: "não pode excluir: item usado em OP" }),
    ]);
    expect(res.interrompido).toBe(false);
  });

  it("bloqueio real no meio do espelho para o lote e lista o que deixou de remover", async () => {
    const { fn, calls } = comEstrutura(
      [
        { idMalha: 7, idProdMalha: 700, codProdMalha: "OUTRO", quantProdMalha: 1 },
        { idMalha: 8, idProdMalha: 800, codProdMalha: "MAIS UM", quantProdMalha: 1 },
      ],
      (rec) => (rec.call === "ExcluirEstrutura" ? new OmieBlocked("consumo indevido") : {}),
    );

    const res = await orquestrarEnvio({ novos: [], estrutura: [rel("PAI", "FILHO", 1)] }, fn);

    expect(res.interrompido).toBe(true);
    expect(res.bloqueado).toBe(true);
    expect(calls.filter((c) => c.call === "ExcluirEstrutura")).toHaveLength(1);
    expect(res.remocoes.map((r) => [r.codigoFilho, r.outcome])).toEqual([
      ["OUTRO", "falha"],
      ["MAIS UM", "nao_enviado"],
    ]);
  });

  it("pai que não está no envio NÃO é lido nem mexido", async () => {
    const { fn, calls } = comEstrutura([{ idMalha: 7, idProdMalha: 700, codProdMalha: "OUTRO", quantProdMalha: 1 }]);

    await orquestrarEnvio({ novos: [item("FILHO", null)], estrutura: [] }, fn);

    expect(calls.some((c) => c.path === "geral/malha/")).toBe(false);
  });

  it("montagem de destino digitada em minúsculas ainda é lida e espelhada pelo ID interno", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            { codigo: "XXXXX MT999 ZZZZZ", codigo_produto: 777 },
            { codigo: "AAAAA SM001 CCCCC", codigo_produto: 888 },
          ],
        };
      }
      if (rec.call === "ConsultarEstrutura") {
        return { itens: [{ idMalha: 5, idProdMalha: 888, codProdMalha: "AAAAA SM001 CCCCC", quantProdMalha: 1 }] };
      }
      return {};
    });
    const raiz: EstruturaRel = {
      numeroPai: "0",
      numeroFilho: "1",
      codigoPai: "xxxxx mt999 zzzzz",
      codigoFilho: "AAAAA SM001 CCCCC",
      descricaoFilho: "filho",
      quantidade: 2,
      origem: "raiz",
    };

    const res = await orquestrarEnvio({ novos: [], estrutura: [raiz] }, fn);

    expect(calls.find((c) => c.call === "ConsultarEstrutura")?.param).toEqual({ idProduto: 777 });
    expect(calls.find((c) => c.call === "AlterarEstrutura")?.param).toMatchObject({ idProduto: 777 });
    expect(res.estrutura[0].outcome).toBe("atualizado");
  });
});

describe("orquestrarEnvio — recusa não-novos", () => {
  it("envia só os itens novo e conta os recusados", async () => {
    const { fn, calls } = mockChamar(() => ({}));
    const novos = [item("A", null, "novo"), item("B", null, "duplicado"), item("C", null, "erro")];
    const res = await orquestrarEnvio({ novos, estrutura: [] }, fn);

    expect(res.totais.recusados).toBe(2);
    expect(res.produtos).toHaveLength(1);
    expect(res.produtos[0].codigo).toBe("A");
    expect(calls.filter((c) => c.call === "UpsertProduto")).toHaveLength(1);
  });
});

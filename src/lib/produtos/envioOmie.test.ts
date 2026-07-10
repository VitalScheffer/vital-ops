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
  };
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

  it("pula a relação de estrutura que JÁ existe no pai (reenvio idempotente, sem IncluirEstrutura)", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            { codigo: "PAI", codigo_produto: 500 },
            { codigo: "FILHO", codigo_produto: 600 },
          ],
        };
      }
      if (rec.call === "ConsultarEstrutura") return { itens: [{ idProdMalha: 600 }] }; // PAI->FILHO já existe
      return {};
    });
    const res = await orquestrarEnvio({ novos: [item("PAI", null)], estrutura: [rel("PAI", "FILHO", 2)] }, fn);
    expect(res.estrutura[0].outcome).toBe("ja_existia");
    expect(calls.some((c) => c.call === "IncluirEstrutura")).toBe(false);
  });

  it("inclui a relação nova mesmo quando o pai já tem OUTRAS relações", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            { codigo: "PAI", codigo_produto: 500 },
            { codigo: "FILHO", codigo_produto: 600 },
          ],
        };
      }
      if (rec.call === "ConsultarEstrutura") return { itens: [{ idProdMalha: 999 }] }; // outra relação, não a nossa
      return {};
    });
    const res = await orquestrarEnvio({ novos: [item("PAI", null)], estrutura: [rel("PAI", "FILHO", 2)] }, fn);
    expect(res.estrutura[0].outcome).toBe("enviado");
    expect(calls.some((c) => c.call === "IncluirEstrutura")).toBe(true);
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

  it("envia somente a estrutura entre cadastros existentes, sem exigir produto novo", async () => {
    const { fn, calls } = mockChamar((rec) => {
      if (rec.call === "ListarProdutos") {
        return {
          produto_servico_cadastro: [
            { codigo: "MONTAGEM", codigo_produto: 700 },
            { codigo: "SUBMONTAGEM", codigo_produto: 701 },
          ],
        };
      }
      if (rec.call === "ConsultarEstrutura") return { itens: [] };
      return {};
    });

    const res = await orquestrarEnvio({ novos: [], estrutura: [rel("MONTAGEM", "SUBMONTAGEM", 1)] }, fn);

    expect(res.produtos).toEqual([]);
    expect(res.estrutura[0].outcome).toBe("enviado");
    expect(calls.some((c) => c.call === "UpsertProduto")).toBe(false);
    expect(calls.find((c) => c.call === "IncluirEstrutura")?.param).toMatchObject({
      idProduto: 700,
      itemMalhaIncluir: [{ idProdMalha: 701 }],
    });
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

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

    expect(calls.map((c) => c.call)).toEqual(["UpsertFamilia", "UpsertProduto", "IncluirEstrutura"]);
    expect(calls.map((c) => c.path)).toEqual(["geral/familias/", "geral/produtos/", "geral/malha/"]);
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
      nomeFamilia: "SUBMONTAGEM",
      inativo: "N",
    });
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

    const listar = calls.find((c) => c.call === "ListarProdutos");
    expect(listar?.param).toMatchObject({ produtosPorCodigo: [{ codigo: CODIGO_EXISTENTE }] });
  });

  it("estrutura referencia o codigo_produto_integracao REAL do cadastro existente, não o nosso", async () => {
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
    expect(est?.param).toMatchObject({ intProduto: "COMDBP0381018AC" });
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
      if (rec.call === "ListarProdutos") return new OmieBlocked("bloqueado");
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

  it("estrutura referencia o codigo_produto_integracao REAL do cadastro existente, não o nosso", async () => {
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
    expect(est?.param).toMatchObject({ intProduto: "CREHIPC021ITSLD" });
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

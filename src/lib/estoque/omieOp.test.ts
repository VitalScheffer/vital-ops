import { describe, expect, it, vi } from "vitest";

import { OmieBlocked, OmieDuplicate, OmieError } from "@/lib/omie/errors";
import type { ChamarFn, ProdutoEstoque, SaldoEstoque } from "./omieEstoque";
import {
  acharOrdem,
  agregarItens,
  buscarProdutosPorId,
  chaveDaOrdem,
  grupoDoItem,
  listarOrdensProducao,
  transferirEstoque,
  type ContextoTransferencia,
  type ItemOrdem,
  type ItemTransferencia,
  type OrdemProducao,
} from "./omieOp";

// Recorte fiel de uma resposta real do ListarOrdemProducao (OP 2026/00801,
// CREHS MT002 I0POL, 10 unidades — capturada da API em 28/08/2026).
const RESPOSTA_OP = {
  pagina: 1,
  total_de_paginas: 1,
  total_de_registros: 2,
  cadastros: [
    {
      identificacao: {
        cNumOP: "2026/00801",
        nCodOP: 12172431727,
        nCodProduto: 12099267307,
        nQtde: 10,
        dDtPrevisao: "31/08/2026",
        codigo_local_estoque: 5702636851,
      },
      outrasInf: { cConcluida: "N" },
      itensDetalhes: [
        { nIdProdutoMalha: 12128056162, nQtde: 10, codigo_local_estoque: 5702636851, cReservado: "N" },
        { nIdProdutoMalha: 12098285735, nQtde: 11.7349, codigo_local_estoque: 5702636851, cReservado: "N" },
        // MESMO material de novo: entra em outra peça da mesma OP.
        { nIdProdutoMalha: 12098285735, nQtde: 3.2651, codigo_local_estoque: 5702636851, cReservado: "S" },
      ],
    },
    {
      identificacao: { cNumOP: "2024/00475", nCodOP: 8755550541, nCodProduto: 5781052017, nQtde: 1 },
      outrasInf: { cConcluida: "S" },
      itensDetalhes: [],
    },
  ],
};

function ctx(
  produtos: Record<string, ProdutoEstoque>,
  saldos: Record<string, SaldoEstoque>,
  extra: Partial<ContextoTransferencia> = {},
): ContextoTransferencia {
  return {
    data: "28/08/2026",
    origemCodigo: "5940905787",
    destinoCodigo: "12170621031",
    produtos: new Map(Object.entries(produtos)),
    saldos: new Map(Object.entries(saldos)),
    ...extra,
  };
}

const ITEM: ItemTransferencia = {
  chave: "mvi-1",
  sku: "MATCH 00060 IN430",
  idProd: "12128056828",
  quantidade: 21.6566,
  obs: "OP 2026/00801",
};

describe("listarOrdensProducao", () => {
  it("lê número, produto, quantidade e itens da resposta do Omie", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue(RESPOSTA_OP);
    const ordens = await listarOrdensProducao(chamar);

    expect(ordens).toHaveLength(2);
    expect(ordens[0]).toMatchObject({
      numero: "2026/00801",
      codigo: "12172431727",
      idProduto: "12099267307",
      quantidade: 10,
      dataPrevisao: "31/08/2026",
      concluida: false,
    });
    expect(ordens[0].itens).toHaveLength(3);
    expect(ordens[1].concluida).toBe(true);
  });

  it("pede os itens ao Omie (sem eles a tela não teria o que mover)", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue(RESPOSTA_OP);
    await listarOrdensProducao(chamar);

    expect(chamar).toHaveBeenCalledWith(
      "produtos/op/",
      "ListarOrdemProducao",
      expect.objectContaining({ lExibirItens: true }),
      expect.objectContaining({ ttlSeconds: expect.any(Number) }),
    );
  });

  it("para na última página anunciada", async () => {
    const chamar = vi
      .fn<ChamarFn>()
      .mockResolvedValueOnce({ ...RESPOSTA_OP, total_de_paginas: 2 })
      .mockResolvedValueOnce({ ...RESPOSTA_OP, pagina: 2, total_de_paginas: 2 });

    const ordens = await listarOrdensProducao(chamar);
    expect(chamar).toHaveBeenCalledTimes(2);
    expect(ordens).toHaveLength(4);
  });
});

describe("chaveDaOrdem / acharOrdem", () => {
  const ordens = [
    { numero: "2026/00801" },
    { numero: "2026/00802" },
    { numero: "2024/00802" },
  ] as OrdemProducao[];

  it("normaliza os jeitos de escrever o mesmo número", () => {
    expect(chaveDaOrdem("2026/00802")).toBe("2026/802");
    expect(chaveDaOrdem("2026-802")).toBe("2026/802");
    expect(chaveDaOrdem(" 2026 / 0802 ")).toBe("2026/802");
  });

  it("acha pelo número completo", () => {
    expect(acharOrdem("2026-801", ordens).ordem?.numero).toBe("2026/00801");
  });

  it("acha pelo sequencial quando ele é único", () => {
    expect(acharOrdem("801", ordens).ordem?.numero).toBe("2026/00801");
  });

  it("com sequencial repetido em anos diferentes, NÃO escolhe: devolve as candidatas", () => {
    const resultado = acharOrdem("802", ordens);
    expect(resultado.ordem).toBeUndefined();
    expect(resultado.ambiguas?.map((o) => o.numero)).toEqual(["2026/00802", "2024/00802"]);
  });

  it("devolve vazio para OP inexistente", () => {
    expect(acharOrdem("9999", ordens)).toEqual({});
  });
});

describe("agregarItens", () => {
  it("soma o mesmo produto que entra em peças diferentes", () => {
    const itens: ItemOrdem[] = [
      { idProd: "A", quantidade: 11.7349, reservado: false },
      { idProd: "B", quantidade: 10, reservado: false },
      { idProd: "A", quantidade: 3.2651, reservado: true },
    ];
    const somados = agregarItens(itens);

    expect(somados).toHaveLength(2);
    expect(somados[0]).toMatchObject({ idProd: "A", quantidade: 15, reservado: true });
    expect(somados[1].idProd).toBe("B");
  });

  it("não deixa erro de ponto flutuante vazar para a quantidade", () => {
    const somados = agregarItens([
      { idProd: "A", quantidade: 0.1, reservado: false },
      { idProd: "A", quantidade: 0.2, reservado: false },
    ]);
    expect(somados[0].quantidade).toBe(0.3);
  });
});

describe("grupoDoItem", () => {
  it("classifica pelas siglas de família do padrão novo", () => {
    expect(grupoDoItem("MATCH 00060 IN430", "MAT - MATERIA PRIMA")).toBe("MAT");
    expect(grupoDoItem("CREHS SM001 I0POL", "SBM - SUBMONTAGEM")).toBe("SBM");
    expect(grupoDoItem("CREHI PC001 ICPOL", "PCA - PEÇAS ACABADAS")).toBe("PECA");
  });

  it("reconhece a família legada sem sigla", () => {
    expect(grupoDoItem("PRD00620", "MATÉRIA-PRIMA")).toBe("MAT");
  });

  it("NÃO confunde 'MATERIAIS DE ESCRITÓRIO' com matéria-prima", () => {
    expect(grupoDoItem("PRD00026", "MATERIAIS DE ESCRITÓRIO")).toBe("OUTRO");
  });

  it("cai no prefixo do código quando a família não ajuda", () => {
    expect(grupoDoItem("MATTB RD190 12I43")).toBe("MAT");
    expect(grupoDoItem("COMDB P0381 018AC", "")).toBe("COM");
  });
});

describe("buscarProdutosPorId", () => {
  it("consulta em LOTE pelo id interno e já classifica o grupo", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({
      produto_servico_cadastro: [
        {
          codigo_produto: 12128056828,
          codigo: "MATCH 00060 IN430",
          descricao: "MATCH 00060 IN430 - CHAPA ESP 0,60 AÇO INOX 430",
          unidade: "KG",
          descricao_familia: "MAT - MATERIA PRIMA",
          produto_lote: "N",
        },
      ],
    });

    const mapa = await buscarProdutosPorId(["12128056828", "12128056828"], chamar);

    expect(chamar).toHaveBeenCalledTimes(1);
    expect(chamar).toHaveBeenCalledWith(
      "geral/produtos/",
      "ListarProdutos",
      expect.objectContaining({ produtosPorCodigo: [{ codigo_produto: 12128056828 }] }),
    );
    expect(mapa.get("12128056828")).toMatchObject({
      codigo: "MATCH 00060 IN430",
      unidade: "KG",
      grupo: "MAT",
      controleLote: false,
    });
  });
});

describe("transferirEstoque", () => {
  const produtos = { "MATCH 00060 IN430": { idProd: "12128056828", descricao: "Chapa 0,60" } };
  const saldos = { "MATCH 00060 IN430": { saldo: 100, cmc: 12.5 } };

  it("lança SAÍDA na origem e ENTRADA no destino, nessa ordem", async () => {
    const chamar = vi
      .fn<ChamarFn>()
      .mockResolvedValueOnce({ id_ajuste: 777 })
      .mockResolvedValueOnce({ id_ajuste: 888 });

    const resultado = await transferirEstoque([ITEM], ctx(produtos, saldos), chamar);

    expect(chamar).toHaveBeenCalledTimes(2);
    const [, , saida] = chamar.mock.calls[0];
    const [, , entrada] = chamar.mock.calls[1];
    expect(saida).toMatchObject({
      cod_int_ajuste: "mvi-1-s",
      tipo: "SAI",
      codigo_local_estoque: 5940905787,
      quan: 21.6566,
    });
    expect(entrada).toMatchObject({
      cod_int_ajuste: "mvi-1-e",
      tipo: "ENT",
      codigo_local_estoque: 12170621031,
      quan: 21.6566,
    });
    expect(resultado.itens[0]).toMatchObject({
      outcome: "transferido",
      refSaida: "777",
      refEntrada: "888",
    });
  });

  it("saída OK e entrada falhando vira ENTRADA PENDENTE, não falha", async () => {
    const chamar = vi
      .fn<ChamarFn>()
      .mockResolvedValueOnce({ id_ajuste: 777 })
      .mockRejectedValueOnce(new OmieError("Erro no destino"));

    const resultado = await transferirEstoque([ITEM], ctx(produtos, saldos), chamar);

    expect(resultado.itens[0]).toMatchObject({ outcome: "entrada_pendente", refSaida: "777" });
  });

  it("na retomada manda SÓ a entrada (a saída já aconteceu)", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 888 });

    const resultado = await transferirEstoque(
      [{ ...ITEM, saidaFeita: true }],
      ctx(produtos, { "MATCH 00060 IN430": { saldo: 0, cmc: 12.5 } }),
      chamar,
    );

    expect(chamar).toHaveBeenCalledTimes(1);
    expect(chamar.mock.calls[0][2]).toMatchObject({ tipo: "ENT", cod_int_ajuste: "mvi-1-e" });
    expect(resultado.itens[0].outcome).toBe("transferido");
  });

  it("saldo insuficiente na origem NEM vira chamada", async () => {
    const chamar = vi.fn<ChamarFn>();

    const resultado = await transferirEstoque(
      [ITEM],
      ctx(produtos, { "MATCH 00060 IN430": { saldo: 1, cmc: 12.5 } }),
      chamar,
    );

    expect(chamar).not.toHaveBeenCalled();
    expect(resultado.itens[0].outcome).toBe("falha");
    expect(resultado.itens[0].motivo).toContain("Saldo insuficiente");
  });

  it("saída duplicada segue para a entrada (é o reenvio que conserta o pendente)", async () => {
    const chamar = vi
      .fn<ChamarFn>()
      .mockRejectedValueOnce(new OmieDuplicate("cod_int_ajuste já utilizado"))
      .mockResolvedValueOnce({ id_ajuste: 888 });

    const resultado = await transferirEstoque([ITEM], ctx(produtos, saldos), chamar);

    expect(chamar).toHaveBeenCalledTimes(2);
    expect(resultado.itens[0]).toMatchObject({ outcome: "transferido", refEntrada: "888" });
  });

  it("as duas pernas duplicadas = já transferido (idempotente)", async () => {
    const chamar = vi
      .fn<ChamarFn>()
      .mockRejectedValueOnce(new OmieDuplicate("já existe"))
      .mockRejectedValueOnce(new OmieDuplicate("já existe"));

    const resultado = await transferirEstoque([ITEM], ctx(produtos, saldos), chamar);
    expect(resultado.itens[0].outcome).toBe("ja_transferido");
  });

  it("bloqueio do Omie na saída interrompe e não deixa item pela metade", async () => {
    const chamar = vi.fn<ChamarFn>().mockRejectedValue(new OmieBlocked("bloqueado"));

    const resultado = await transferirEstoque(
      [ITEM, { ...ITEM, chave: "mvi-2" }],
      ctx(produtos, saldos),
      chamar,
    );

    expect(chamar).toHaveBeenCalledTimes(1);
    expect(resultado.bloqueado).toBe(true);
    expect(resultado.itens.map((i) => i.outcome)).toEqual(["nao_transferido", "nao_transferido"]);
  });

  it("produto ausente do contexto falha localmente", async () => {
    const chamar = vi.fn<ChamarFn>();
    const resultado = await transferirEstoque([ITEM], ctx({}, saldos), chamar);

    expect(chamar).not.toHaveBeenCalled();
    expect(resultado.itens[0].motivo).toContain("não encontrado");
  });

  it("sem custo médio, omite o valor nos dois ajustes", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 1 });

    await transferirEstoque([ITEM], ctx(produtos, { "MATCH 00060 IN430": { saldo: 100, cmc: 0 } }), chamar);

    expect(chamar.mock.calls[0][2]).not.toHaveProperty("valor");
    expect(chamar.mock.calls[1][2]).not.toHaveProperty("valor");
  });
});

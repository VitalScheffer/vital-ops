import { describe, expect, it, vi } from "vitest";

import { OmieBlocked, OmieDuplicate, OmieError } from "@/lib/omie/errors";
import {
  baixarEstoque,
  buscarProdutosPorCodigo,
  dataOmieHoje,
  listarLocaisEstoque,
  nomeDoLocal,
  saldosPorCodigo,
  type ChamarFn,
  type ContextoBaixa,
  type ItemBaixa,
  type ProdutoEstoque,
  type SaldoEstoque,
} from "./omieEstoque";

function contexto(
  produtos: Record<string, ProdutoEstoque>,
  saldos: Record<string, SaldoEstoque>,
): ContextoBaixa {
  return {
    data: "16/07/2026",
    produtos: new Map(Object.entries(produtos)),
    saldos: new Map(Object.entries(saldos)),
  };
}

const ITEM: ItemBaixa = { chave: "item-1", sku: "MAT 001", quantidade: 2, obs: "REQ-0001" };

describe("buscarProdutosPorCodigo", () => {
  it("consulta em lote e mapeia codigo → id interno + descrição", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({
      produto_servico_cadastro: [
        { codigo: "MAT 001", codigo_produto: 111, descricao: "Fita adesiva" },
        { codigo: "MAT 002", codigo_produto: 222, descricao: "Cola" },
      ],
    });
    const mapa = await buscarProdutosPorCodigo(["MAT 001", "MAT 002", "MAT 001"], chamar);
    expect(chamar).toHaveBeenCalledTimes(1);
    const [path, call, param] = chamar.mock.calls[0];
    expect(path).toBe("geral/produtos/");
    expect(call).toBe("ListarProdutos");
    expect((param as { produtosPorCodigo: unknown[] }).produtosPorCodigo).toEqual([
      { codigo: "MAT 001" },
      { codigo: "MAT 002" },
    ]);
    expect(mapa.get("MAT 001")).toEqual({ idProd: "111", descricao: "Fita adesiva" });
    expect(mapa.get("MAT 002")).toEqual({ idProd: "222", descricao: "Cola" });
  });

  it("quebra em blocos de 50 códigos por chamada", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ produto_servico_cadastro: [] });
    const codigos = Array.from({ length: 60 }, (_, i) => `SKU${i}`);
    await buscarProdutosPorCodigo(codigos, chamar);
    expect(chamar).toHaveBeenCalledTimes(2);
  });

  it("código inexistente simplesmente não entra no mapa", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({
      produto_servico_cadastro: [{ codigo: "EXISTE", codigo_produto: 1, descricao: "x" }],
    });
    const mapa = await buscarProdutosPorCodigo(["EXISTE", "NAO-EXISTE"], chamar);
    expect(mapa.has("NAO-EXISTE")).toBe(false);
  });
});

describe("saldosPorCodigo", () => {
  it("uma chamada só, local padrão (codigo_local_estoque 0), mapeia saldo e CMC", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({
      produtos: [
        { cCodigo: "MAT 001", nSaldo: 10, nCMC: 2.5 },
        { cCodigo: "MAT 002", nSaldo: 0 },
      ],
    });
    const mapa = await saldosPorCodigo(["MAT 001", "MAT 002"], "16/07/2026", chamar);
    expect(chamar).toHaveBeenCalledTimes(1);
    const [path, call, param] = chamar.mock.calls[0];
    expect(path).toBe("estoque/consulta/");
    expect(call).toBe("ListarPosEstoque");
    expect(param).toMatchObject({ codigo_local_estoque: 0, dDataPosicao: "16/07/2026" });
    expect(mapa.get("MAT 001")).toEqual({ saldo: 10, cmc: 2.5 });
    expect(mapa.get("MAT 002")).toEqual({ saldo: 0, cmc: 0 });
  });

  it("consulta um local específico com cExibeTodos 'S' (zerado no local NÃO pode virar fault)", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ produtos: [] });
    await saldosPorCodigo(["MAT 001"], "16/07/2026", chamar, "8667075521");
    const [, , param] = chamar.mock.calls[0];
    expect(param).toMatchObject({ codigo_local_estoque: 8667075521, cExibeTodos: "S" });
  });

  it("lista vazia não chama o Omie", async () => {
    const chamar = vi.fn<ChamarFn>();
    const mapa = await saldosPorCodigo([], "16/07/2026", chamar);
    expect(chamar).not.toHaveBeenCalled();
    expect(mapa.size).toBe(0);
  });
});

describe("listarLocaisEstoque / nomeDoLocal", () => {
  const RESPOSTA = {
    nTotPaginas: 1,
    locaisEncontrados: [
      { codigo_local_estoque: 111, descricao: "Local Padrão", padrao: "S" },
      { codigo_local_estoque: 222, descricao: "Matéria-Prima", padrao: "N" },
      { codigo_local_estoque: 333, descricao: "Desativado", inativo: "S" },
    ],
  };

  it("lista os locais ativos com código/descrição/padrão", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue(RESPOSTA);
    const locais = await listarLocaisEstoque(chamar);
    expect(locais).toEqual([
      { codigo: "111", descricao: "Local Padrão", padrao: true },
      { codigo: "222", descricao: "Matéria-Prima", padrao: false },
    ]);
  });

  it("nomeDoLocal resolve o padrão ('0') e um local pelo código; erro vira undefined", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue(RESPOSTA);
    expect(await nomeDoLocal("0", chamar)).toBe("Local Padrão");
    expect(await nomeDoLocal("222", chamar)).toBe("Matéria-Prima");
    const quebrado = vi.fn<ChamarFn>().mockRejectedValue(new OmieError("fora do ar"));
    expect(await nomeDoLocal("222", quebrado)).toBeUndefined();
  });
});

describe("baixarEstoque", () => {
  it("baixa com id_prod, tipo SAI, motivo OPS, valor = CMC × quantidade e cod_int_ajuste nosso", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 987 });
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita" } },
      { "MAT 001": { saldo: 10, cmc: 2.5 } },
    );
    const resultado = await baixarEstoque([ITEM], ctx, chamar);

    expect(chamar).toHaveBeenCalledTimes(1);
    const [path, call, param, options] = chamar.mock.calls[0];
    expect(path).toBe("estoque/ajuste/");
    expect(call).toBe("IncluirAjusteEstoque");
    expect(options).toEqual({ write: true });
    expect(param).toMatchObject({
      cod_int_ajuste: "item-1",
      id_prod: 111,
      data: "16/07/2026",
      quan: 2,
      tipo: "SAI",
      motivo: "OPS",
      origem: "AJU",
      valor: 5,
      obs: "REQ-0001",
    });
    expect(resultado.itens[0]).toMatchObject({ outcome: "baixado", omieRef: "987" });
    expect(resultado.interrompido).toBe(false);
    // Sem local escolhido, o campo é OMITIDO (Omie assume o local padrão).
    expect(param).not.toHaveProperty("codigo_local_estoque");
  });

  it("com local escolhido, o ajuste leva codigo_local_estoque numérico", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 1 });
    const ctx: ContextoBaixa = {
      ...contexto(
        { "MAT 001": { idProd: "111", descricao: "Fita" } },
        { "MAT 001": { saldo: 10, cmc: 1 } },
      ),
      codigoLocal: "8667075521",
    };
    await baixarEstoque([ITEM], ctx, chamar);
    const [, , param] = chamar.mock.calls[0];
    expect(param).toMatchObject({ codigo_local_estoque: 8667075521 });
  });

  it("código desconhecido e saldo insuficiente falham SEM chamar o Omie", async () => {
    const chamar = vi.fn<ChamarFn>();
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita" } },
      { "MAT 001": { saldo: 1, cmc: 1 } },
    );
    const resultado = await baixarEstoque(
      [
        { chave: "a", sku: "NAO-EXISTE", quantidade: 1, obs: "" },
        { chave: "b", sku: "MAT 001", quantidade: 2, obs: "" },
      ],
      ctx,
      chamar,
    );
    expect(chamar).not.toHaveBeenCalled();
    expect(resultado.itens[0]).toMatchObject({ outcome: "falha" });
    expect(resultado.itens[0].motivo).toContain("não encontrado");
    expect(resultado.itens[1]).toMatchObject({ outcome: "falha" });
    expect(resultado.itens[1].motivo).toContain("Saldo insuficiente");
  });

  it("OmieDuplicate (cod_int_ajuste repetido) vira 'já baixado' — reenvio não baixa duas vezes", async () => {
    const chamar = vi.fn<ChamarFn>().mockRejectedValue(new OmieDuplicate("ja cadastrado"));
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita" } },
      { "MAT 001": { saldo: 10, cmc: 1 } },
    );
    const resultado = await baixarEstoque([ITEM], ctx, chamar);
    expect(resultado.itens[0].outcome).toBe("ja_baixado");
  });

  it("OmieBlocked interrompe o lote e marca o restante como não baixado", async () => {
    const chamar = vi
      .fn<ChamarFn>()
      .mockRejectedValueOnce(new OmieBlocked("bloqueado por consumo indevido"));
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita" }, "MAT 002": { idProd: "222", descricao: "Cola" } },
      { "MAT 001": { saldo: 10, cmc: 1 }, "MAT 002": { saldo: 10, cmc: 1 } },
    );
    const resultado = await baixarEstoque(
      [ITEM, { chave: "item-2", sku: "MAT 002", quantidade: 1, obs: "" }],
      ctx,
      chamar,
    );
    expect(chamar).toHaveBeenCalledTimes(1);
    expect(resultado.bloqueado).toBe(true);
    expect(resultado.interrompido).toBe(true);
    expect(resultado.itens[0].outcome).toBe("nao_baixado");
    expect(resultado.itens[1].outcome).toBe("nao_baixado");
  });

  it("pausa por segurança após 5 respostas seguidas fora do sucesso limpo", async () => {
    const chamar = vi.fn<ChamarFn>().mockRejectedValue(new OmieError("erro qualquer"));
    const produtos: Record<string, ProdutoEstoque> = {};
    const saldos: Record<string, SaldoEstoque> = {};
    const itens: ItemBaixa[] = Array.from({ length: 7 }, (_, i) => {
      const sku = `SKU${i}`;
      produtos[sku] = { idProd: String(i + 1), descricao: sku };
      saldos[sku] = { saldo: 100, cmc: 1 };
      return { chave: `k${i}`, sku, quantidade: 1, obs: "" };
    });
    const resultado = await baixarEstoque(itens, contexto(produtos, saldos), chamar);
    expect(chamar).toHaveBeenCalledTimes(5);
    expect(resultado.interrompido).toBe(true);
    expect(resultado.bloqueado).toBe(false);
    expect(resultado.itens.filter((i) => i.outcome === "falha")).toHaveLength(5);
    expect(resultado.itens.filter((i) => i.outcome === "nao_baixado")).toHaveLength(2);
  });

  it("um sucesso limpo no meio zera a sequência de risco (não pausa)", async () => {
    const chamar = vi
      .fn<ChamarFn>()
      .mockRejectedValueOnce(new OmieError("e1"))
      .mockRejectedValueOnce(new OmieError("e2"))
      .mockRejectedValueOnce(new OmieError("e3"))
      .mockRejectedValueOnce(new OmieError("e4"))
      .mockResolvedValueOnce({ id_ajuste: 1 })
      .mockRejectedValueOnce(new OmieError("e5"));
    const produtos: Record<string, ProdutoEstoque> = {};
    const saldos: Record<string, SaldoEstoque> = {};
    const itens: ItemBaixa[] = Array.from({ length: 6 }, (_, i) => {
      const sku = `SKU${i}`;
      produtos[sku] = { idProd: String(i + 1), descricao: sku };
      saldos[sku] = { saldo: 100, cmc: 1 };
      return { chave: `k${i}`, sku, quantidade: 1, obs: "" };
    });
    const resultado = await baixarEstoque(itens, contexto(produtos, saldos), chamar);
    expect(chamar).toHaveBeenCalledTimes(6);
    expect(resultado.interrompido).toBe(false);
  });

  it("falha local (sem chamada) NÃO conta pra sequência de risco", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 1 });
    const produtos: Record<string, ProdutoEstoque> = { OK: { idProd: "1", descricao: "ok" } };
    const saldos: Record<string, SaldoEstoque> = { OK: { saldo: 100, cmc: 1 } };
    const itens: ItemBaixa[] = [
      ...Array.from({ length: 6 }, (_, i) => ({
        chave: `desconhecido-${i}`,
        sku: `NAO-EXISTE-${i}`,
        quantidade: 1,
        obs: "",
      })),
      { chave: "ok", sku: "OK", quantidade: 1, obs: "" },
    ];
    const resultado = await baixarEstoque(itens, contexto(produtos, saldos), chamar);
    expect(resultado.interrompido).toBe(false);
    expect(resultado.itens.at(-1)?.outcome).toBe("baixado");
  });

  it("erro de lote vira mensagem amigável orientando a baixa manual", async () => {
    const chamar = vi
      .fn<ChamarFn>()
      .mockRejectedValue(new OmieError("O preenchimento da tag [lote_validade] é obrigatório!"));
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita" } },
      { "MAT 001": { saldo: 10, cmc: 1 } },
    );
    const resultado = await baixarEstoque([ITEM], ctx, chamar);
    expect(resultado.itens[0].outcome).toBe("falha");
    expect(resultado.itens[0].motivo).toContain("controle de lote");
  });
});

describe("dataOmieHoje", () => {
  it("formata DD/MM/AAAA no fuso de São Paulo", () => {
    // 2026-07-16T02:00Z ainda é 15/07 em São Paulo (UTC-3).
    expect(dataOmieHoje(new Date("2026-07-16T02:00:00Z"))).toBe("15/07/2026");
    expect(dataOmieHoje(new Date("2026-07-16T12:00:00Z"))).toBe("16/07/2026");
  });
});

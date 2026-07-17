import { describe, expect, it, vi } from "vitest";

import { OmieBlocked, OmieDuplicate, OmieError } from "@/lib/omie/errors";
import {
  alocarLotesFEFO,
  baixarEstoque,
  buscarProdutosPorCodigo,
  buscarProdutosPorDescricao,
  consultarLotes,
  dataOmieHoje,
  listarLocaisEstoque,
  lotesPorCodigo,
  nomeDoLocal,
  reverterBaixa,
  saldoTotalPorCodigo,
  saldosPorCodigo,
  type ItemReversao,
  type ChamarFn,
  type ContextoBaixa,
  type ItemBaixa,
  type LoteDisponivel,
  type ProdutoEstoque,
  type SaldoEstoque,
} from "./omieEstoque";

function contexto(
  produtos: Record<string, ProdutoEstoque>,
  saldos: Record<string, SaldoEstoque>,
  lotes?: Record<string, LoteDisponivel[]>,
): ContextoBaixa {
  return {
    data: "16/07/2026",
    produtos: new Map(Object.entries(produtos)),
    saldos: new Map(Object.entries(saldos)),
    ...(lotes ? { lotes: new Map(Object.entries(lotes)) } : {}),
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

  it("marca controleLote quando produto_lote = 'S' (e não marca quando 'N'/ausente)", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({
      produto_servico_cadastro: [
        { codigo: "COM LOTE", codigo_produto: 1, descricao: "a", produto_lote: "S" },
        { codigo: "SEM LOTE", codigo_produto: 2, descricao: "b", produto_lote: "N" },
        { codigo: "OMISSO", codigo_produto: 3, descricao: "c" },
      ],
    });
    const mapa = await buscarProdutosPorCodigo(["COM LOTE", "SEM LOTE", "OMISSO"], chamar);
    expect(mapa.get("COM LOTE")?.controleLote).toBe(true);
    expect(mapa.get("SEM LOTE")?.controleLote).toBeUndefined();
    expect(mapa.get("OMISSO")?.controleLote).toBeUndefined();
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
    expect(mapa.get("MAT 001")).toEqual({ saldo: 10, cmc: 2.5, estoqueMinimo: 0 });
    expect(mapa.get("MAT 002")).toEqual({ saldo: 0, cmc: 0, estoqueMinimo: 0 });
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

  it("lê o estoque_minimo do Omie (0 quando ausente)", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({
      produtos: [
        { cCodigo: "MAT 001", nSaldo: 10, nCMC: 2, estoque_minimo: 5 },
        { cCodigo: "MAT 002", nSaldo: 3, nCMC: 1 },
      ],
    });
    const mapa = await saldosPorCodigo(["MAT 001", "MAT 002"], "16/07/2026", chamar);
    expect(mapa.get("MAT 001")?.estoqueMinimo).toBe(5);
    expect(mapa.get("MAT 002")?.estoqueMinimo).toBe(0);
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

describe("buscarProdutosPorDescricao", () => {
  it("filtra por descrição e descarta inativos, bloqueados e prefixo INATIVO na descrição", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({
      produto_servico_cadastro: [
        { codigo: "P1", descricao: "Folha de lixa grão 220" },
        { codigo: "P2", descricao: "INATIVO1-Papel higiênico folha dupla", inativo: "N" },
        { codigo: "P3", descricao: "Etiqueta folha", inativo: "S" },
        { codigo: "P4", descricao: "Folha bloqueada", bloqueado: "S" },
        { codigo: "P5", descricao: "INATIVO-Folha antiga" },
      ],
    });
    const produtos = await buscarProdutosPorDescricao("folha", chamar);
    const [path, call, param] = chamar.mock.calls[0];
    expect(path).toBe("geral/produtos/");
    expect(call).toBe("ListarProdutos");
    expect(param).toMatchObject({ filtrar_apenas_descricao: "%folha%" });
    expect(produtos.map((p) => p.codigo)).toEqual(["P1"]);
  });

  it("termo com menos de 2 caracteres não chama o Omie", async () => {
    const chamar = vi.fn<ChamarFn>();
    expect(await buscarProdutosPorDescricao("f", chamar)).toEqual([]);
    expect(chamar).not.toHaveBeenCalled();
  });
});

describe("saldoTotalPorCodigo", () => {
  it("soma nSaldo de todos os locais por código (lista_local_estoque TODOS)", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({
      produtos: [
        { cCodigo: "MAT 001", nSaldo: 10 },
        { cCodigo: "MAT 001", nSaldo: 5 }, // outro local
        { cCodigo: "MAT 002", nSaldo: 3 },
      ],
    });
    const mapa = await saldoTotalPorCodigo(["MAT 001", "MAT 002"], "16/07/2026", chamar);
    const [, , param] = chamar.mock.calls[0];
    expect(param).toMatchObject({ lista_local_estoque: "TODOS", cExibeTodos: "S" });
    expect(mapa.get("MAT 001")).toBe(15);
    expect(mapa.get("MAT 002")).toBe(3);
  });

  it("lista vazia não chama o Omie", async () => {
    const chamar = vi.fn<ChamarFn>();
    const mapa = await saldoTotalPorCodigo([], "16/07/2026", chamar);
    expect(chamar).not.toHaveBeenCalled();
    expect(mapa.size).toBe(0);
  });
});

describe("consultarLotes / lotesPorCodigo", () => {
  const RESPOSTA_LOTES = {
    lotes: [
      { nIdLote: 10, cNumLote: "L-A", nSaldoLote: 4, dDataValidade: "01/12/2026" },
      { nIdLote: 20, cNumLote: "L-B", nSaldoLote: 0, dDataValidade: "01/01/2026" }, // sem saldo → fora
      { nIdLote: 30, cNumLote: "L-C", nSaldoLote: 6, dDataValidade: "01/06/2026" },
    ],
  };

  it("consultarLotes traz só lotes com saldo > 0 e passa nIdLocal quando não é o padrão", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue(RESPOSTA_LOTES);
    const lotes = await consultarLotes("111", chamar, "8667075521");
    const [path, call, param] = chamar.mock.calls[0];
    expect(path).toBe("produtos/produtoslote/");
    expect(call).toBe("ConsultarLote");
    expect(param).toMatchObject({ nCodProd: 111, nIdLocal: 8667075521 });
    expect(lotes.map((l) => l.nIdLote)).toEqual(["10", "30"]);
    expect(lotes[0]).toEqual({ nIdLote: "10", numero: "L-A", saldo: 4, validade: "01/12/2026" });
  });

  it("consultarLotes no local padrão ('0') OMITE nIdLocal", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ lotes: [] });
    await consultarLotes("111", chamar);
    const [, , param] = chamar.mock.calls[0];
    expect(param).not.toHaveProperty("nIdLocal");
  });

  it("lotesPorCodigo consulta SÓ produtos com controle de lote (uma vez por SKU)", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ lotes: [] });
    const produtos = new Map<string, ProdutoEstoque>([
      ["COM", { idProd: "1", descricao: "a", controleLote: true }],
      ["SEM", { idProd: "2", descricao: "b" }],
    ]);
    const mapa = await lotesPorCodigo(produtos, ["COM", "SEM", "COM"], chamar);
    expect(chamar).toHaveBeenCalledTimes(1);
    expect(mapa.has("COM")).toBe(true);
    expect(mapa.has("SEM")).toBe(false);
  });
});

describe("alocarLotesFEFO", () => {
  const LOTES: LoteDisponivel[] = [
    { nIdLote: "10", numero: "A", saldo: 4, validade: "01/12/2026" },
    { nIdLote: "30", numero: "C", saldo: 6, validade: "01/06/2026" }, // vence antes
    { nIdLote: "40", numero: "D", saldo: 5 }, // sem validade → por último
  ];

  it("consome primeiro o lote que vence antes (FEFO) e divide entre lotes", () => {
    const { alocacao, faltou } = alocarLotesFEFO(8, LOTES);
    expect(faltou).toBe(0);
    // 6 do lote 30 (vence 01/06) + 2 do lote 10 (vence 01/12).
    expect(alocacao).toEqual([
      { nIdLote: "30", quantidade: 6 },
      { nIdLote: "10", quantidade: 2 },
    ]);
  });

  it("lote sem validade fica por último", () => {
    const { alocacao } = alocarLotesFEFO(11, LOTES);
    expect(alocacao.map((a) => a.nIdLote)).toEqual(["30", "10", "40"]);
    expect(alocacao.at(-1)).toEqual({ nIdLote: "40", quantidade: 1 });
  });

  it("faltou > 0 quando a soma dos saldos não cobre o pedido", () => {
    const { faltou } = alocarLotesFEFO(100, LOTES);
    expect(faltou).toBe(85); // 4 + 6 + 5 = 15 disponível
  });

  it("desconta o que outro item do mesmo lote já pegou (jaConsumido)", () => {
    const { alocacao, faltou } = alocarLotesFEFO(6, LOTES, new Map([["30", 6]]));
    // Lote 30 já esgotado por outro item → sai 4 do 10 e 2 do 40.
    expect(faltou).toBe(0);
    expect(alocacao).toEqual([
      { nIdLote: "10", quantidade: 4 },
      { nIdLote: "40", quantidade: 2 },
    ]);
  });
});

describe("baixarEstoque — controle de lote e custo médio", () => {
  it("produto com lote leva lote_validade FEFO no ajuste", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 1 });
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita", controleLote: true } },
      { "MAT 001": { saldo: 10, cmc: 2 } },
      {
        "MAT 001": [
          { nIdLote: "10", numero: "A", saldo: 4, validade: "01/12/2026" },
          { nIdLote: "30", numero: "C", saldo: 6, validade: "01/06/2026" },
        ],
      },
    );
    const resultado = await baixarEstoque(
      [{ chave: "k1", sku: "MAT 001", quantidade: 5, obs: "" }],
      ctx,
      chamar,
    );
    const [, , param] = chamar.mock.calls[0];
    expect(param).toMatchObject({
      lote_validade: [
        { nIdLote: 30, nQtdLote: 5 },
      ],
    });
    expect(resultado.itens[0].outcome).toBe("baixado");
  });

  it("dois itens do mesmo produto/lote não estouram o saldo do lote", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 1 });
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita", controleLote: true } },
      { "MAT 001": { saldo: 10, cmc: 2 } },
      { "MAT 001": [{ nIdLote: "30", numero: "C", saldo: 6, validade: "01/06/2026" }] },
    );
    await baixarEstoque(
      [
        { chave: "k1", sku: "MAT 001", quantidade: 4, obs: "" },
        { chave: "k2", sku: "MAT 001", quantidade: 2, obs: "" },
      ],
      ctx,
      chamar,
    );
    expect(chamar.mock.calls[0][2]).toMatchObject({ lote_validade: [{ nIdLote: 30, nQtdLote: 4 }] });
    expect(chamar.mock.calls[1][2]).toMatchObject({ lote_validade: [{ nIdLote: 30, nQtdLote: 2 }] });
  });

  it("item que falha no Omie NÃO reserva o lote para o próximo item do mesmo SKU", async () => {
    const chamar = vi
      .fn<ChamarFn>()
      .mockRejectedValueOnce(new OmieError("erro qualquer"))
      .mockResolvedValueOnce({ id_ajuste: 1 });
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita", controleLote: true } },
      { "MAT 001": { saldo: 10, cmc: 2 } },
      { "MAT 001": [{ nIdLote: "30", numero: "C", saldo: 6, validade: "01/06/2026" }] },
    );
    const resultado = await baixarEstoque(
      [
        { chave: "k1", sku: "MAT 001", quantidade: 4, obs: "" },
        { chave: "k2", sku: "MAT 001", quantidade: 5, obs: "" },
      ],
      ctx,
      chamar,
    );
    expect(resultado.itens[0].outcome).toBe("falha");
    expect(resultado.itens[1].outcome).toBe("baixado");
    // k1 falhou, então k2 vê o lote 30 CHEIO (6) e aloca 5 — se a falha tivesse
    // reservado 4, sobrariam só 2 e k2 falharia por saldo de lote.
    expect(chamar.mock.calls[1][2]).toMatchObject({ lote_validade: [{ nIdLote: 30, nQtdLote: 5 }] });
  });

  it("produto com lote SEM lote com saldo falha localmente, sem chamar o Omie", async () => {
    const chamar = vi.fn<ChamarFn>();
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita", controleLote: true } },
      { "MAT 001": { saldo: 10, cmc: 2 } },
      { "MAT 001": [] },
    );
    const resultado = await baixarEstoque(
      [{ chave: "k1", sku: "MAT 001", quantidade: 5, obs: "" }],
      ctx,
      chamar,
    );
    expect(chamar).not.toHaveBeenCalled();
    expect(resultado.itens[0].outcome).toBe("falha");
    expect(resultado.itens[0].motivo).toContain("controle de lote");
  });

  it("sem custo médio (CMC 0) OMITE valor — a baixa só consome o estoque", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 1 });
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita" } },
      { "MAT 001": { saldo: 10, cmc: 0 } },
    );
    const resultado = await baixarEstoque(
      [{ chave: "k1", sku: "MAT 001", quantidade: 3, obs: "" }],
      ctx,
      chamar,
    );
    const [, , param] = chamar.mock.calls[0];
    expect(param).not.toHaveProperty("valor");
    expect(resultado.itens[0].outcome).toBe("baixado");
  });
});

describe("baixarEstoque — resultado carrega custo e lotes (p/ relatório e estorno)", () => {
  it("baixado devolve custoUnitario (CMC) e a alocação de lote", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 1 });
    const ctx = contexto(
      { "MAT 001": { idProd: "111", descricao: "Fita", controleLote: true } },
      { "MAT 001": { saldo: 10, cmc: 2.5 } },
      { "MAT 001": [{ nIdLote: "30", numero: "C", saldo: 6, validade: "01/06/2026" }] },
    );
    const resultado = await baixarEstoque([{ chave: "k1", sku: "MAT 001", quantidade: 4, obs: "" }], ctx, chamar);
    expect(resultado.itens[0].custoUnitario).toBe(2.5);
    expect(resultado.itens[0].lotes).toEqual([{ nIdLote: "30", quantidade: 4 }]);
  });
});

describe("reverterBaixa (estorno)", () => {
  const ITEM_REV: ItemReversao = {
    chave: "bi-1",
    sku: "MAT 001",
    idProd: "111",
    quantidade: 4,
    custoUnitario: 2.5,
    lotes: [{ nIdLote: "30", quantidade: 4 }],
    obs: "Estorno",
  };

  it("lança ENTRADA nos mesmos lotes, valor = custo × qtd, cod_int est-<chave>", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 999 });
    const resultado = await reverterBaixa([ITEM_REV], "16/07/2026", chamar, "8667075521");
    const [path, call, param] = chamar.mock.calls[0];
    expect(path).toBe("estoque/ajuste/");
    expect(call).toBe("IncluirAjusteEstoque");
    expect(param).toMatchObject({
      cod_int_ajuste: "est-bi-1",
      id_prod: 111,
      tipo: "ENT",
      quan: 4,
      valor: 10,
      lote_validade: [{ nIdLote: 30, nQtdLote: 4 }],
      codigo_local_estoque: 8667075521,
    });
    expect(resultado.itens[0]).toMatchObject({ outcome: "estornado", omieRef: "999" });
  });

  it("OmieDuplicate (est-<chave> repetido) = já estornado (idempotente)", async () => {
    const chamar = vi.fn<ChamarFn>().mockRejectedValue(new OmieDuplicate("ja cadastrado"));
    const resultado = await reverterBaixa([ITEM_REV], "16/07/2026", chamar);
    expect(resultado.itens[0].outcome).toBe("ja_estornado");
  });

  it("produto sem lote omite lote_validade; custo 0 omite valor", async () => {
    const chamar = vi.fn<ChamarFn>().mockResolvedValue({ id_ajuste: 1 });
    await reverterBaixa(
      [{ chave: "x", sku: "S", idProd: "9", quantidade: 2, custoUnitario: 0, obs: "" }],
      "16/07/2026",
      chamar,
    );
    const [, , param] = chamar.mock.calls[0];
    expect(param).not.toHaveProperty("lote_validade");
    expect(param).not.toHaveProperty("valor");
  });

  it("OmieBlocked interrompe o estorno", async () => {
    const chamar = vi.fn<ChamarFn>().mockRejectedValue(new OmieBlocked("bloqueado por consumo indevido"));
    const resultado = await reverterBaixa([ITEM_REV, { ...ITEM_REV, chave: "bi-2" }], "16/07/2026", chamar);
    expect(chamar).toHaveBeenCalledTimes(1);
    expect(resultado.bloqueado).toBe(true);
    expect(resultado.itens[0].outcome).toBe("nao_estornado");
    expect(resultado.itens[1].outcome).toBe("nao_estornado");
  });
});

describe("dataOmieHoje", () => {
  it("formata DD/MM/AAAA no fuso de São Paulo", () => {
    // 2026-07-16T02:00Z ainda é 15/07 em São Paulo (UTC-3).
    expect(dataOmieHoje(new Date("2026-07-16T02:00:00Z"))).toBe("15/07/2026");
    expect(dataOmieHoje(new Date("2026-07-16T12:00:00Z"))).toBe("16/07/2026");
  });
});

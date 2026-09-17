import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getRolePermissionsMap: vi.fn(),
  canViewRecebimento: vi.fn(),
  localizarNotaEntradaOmie: vi.fn(),
  listarNotasOmie: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  criarNota: vi.fn(),
  aggregate: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  requestHeaders: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/permissions.server", () => ({ getRolePermissionsMap: mocks.getRolePermissionsMap }));
vi.mock("@/lib/rbac", () => ({ canViewRecebimento: mocks.canViewRecebimento }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    recebimentoNota: { findUnique: mocks.findUnique, findMany: mocks.findMany, create: mocks.criarNota },
    recebimentoItem: { aggregate: mocks.aggregate, create: mocks.create },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/request", () => ({ requestHeaders: mocks.requestHeaders }));
vi.mock("@/lib/recebimento/notasOmie", () => ({
  localizarNotaEntradaOmie: mocks.localizarNotaEntradaOmie,
  listarNotasOmie: mocks.listarNotasOmie,
}));

import {
  adicionarItemRecebimento,
  buscarNotasOmieRecebimento,
  criarNotaRecebimento,
  editarNotaRecebimento,
  listarNotasRecebimentoParaExportacao,
  marcarCheckRecebimento,
  marcarColunaRecebimento,
  removerItemRecebimento,
  removerNotaRecebimento,
} from "./actions";

describe("adicionarItemRecebimento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", name: "Ana", email: "ana@vitalscheffer.com.br", role: "FUNCIONARIO" } });
    mocks.getRolePermissionsMap.mockResolvedValue({});
    mocks.canViewRecebimento.mockReturnValue(true);
    mocks.findUnique.mockResolvedValue({ id: "nota-1", numero: "123" });
    mocks.aggregate.mockResolvedValue({ _max: { ordem: 2 } });
    mocks.create.mockResolvedValue({
      id: "item-3",
      produto: "Produto novo",
      materialRecebido: false,
      temOC: false,
      ocAprovado: false,
      nfeLancada: false,
    });
    mocks.audit.mockResolvedValue(undefined);
    mocks.requestHeaders.mockResolvedValue(new Headers());
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        recebimentoItem: { aggregate: mocks.aggregate, create: mocks.create },
      }),
    );
  });

  it("usa a maior ordem existente em vez da contagem de itens", async () => {
    const resultado = await adicionarItemRecebimento({ notaId: "nota-1", produto: "Produto novo" });

    expect(mocks.aggregate).toHaveBeenCalledWith({ where: { notaId: "nota-1" }, _max: { ordem: true } });
    expect(mocks.create).toHaveBeenCalledWith({ data: { notaId: "nota-1", produto: "Produto novo", ordem: 3 } });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(resultado).toMatchObject({ status: "success", item: { id: "item-3" } });
  });

  it("repete a alocacao quando o banco detectar uma transacao concorrente", async () => {
    mocks.transaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(async (callback) => callback({ recebimentoItem: { aggregate: mocks.aggregate, create: mocks.create } }));

    await adicionarItemRecebimento({ notaId: "nota-1", produto: "Produto novo" });

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledWith({ data: { notaId: "nota-1", produto: "Produto novo", ordem: 3 } });
  });
});

describe("guard de Recebimento", () => {
  const chamadas = [
    () => buscarNotasOmieRecebimento(),
    () => listarNotasRecebimentoParaExportacao({ inicio: "2026-09-14", fim: "2026-09-20" }),
    () => criarNotaRecebimento({ numero: "123" }),
    () => editarNotaRecebimento({ id: "nota-1", numero: "123" }),
    () => removerNotaRecebimento({ id: "nota-1" }),
    () => adicionarItemRecebimento({ notaId: "nota-1", produto: "Produto" }),
    () => removerItemRecebimento({ id: "item-1" }),
    () => marcarCheckRecebimento({ itemId: "item-1", evento: "temOC", marcado: true }),
    () => marcarColunaRecebimento({ notaId: "nota-1", evento: "temOC", marcado: true }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", name: "Ana", email: "ana@vitalscheffer.com.br", role: "FUNCIONARIO" } });
    mocks.getRolePermissionsMap.mockResolvedValue({});
    mocks.canViewRecebimento.mockReturnValue(true);
  });

  it("rejeita todas as actions sem sessao antes de acessar o banco", async () => {
    mocks.auth.mockResolvedValue(null);

    const resultados = await Promise.all(chamadas.map((chamar) => chamar()));

    resultados.forEach((resultado) => expect(resultado).toMatchObject({ status: "error", message: expect.any(String) }));
    expect(mocks.getRolePermissionsMap).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.aggregate).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.listarNotasOmie).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejeita todas as actions quando a permissao de Recebimento estiver revogada", async () => {
    mocks.canViewRecebimento.mockReturnValue(false);

    const resultados = await Promise.all(chamadas.map((chamar) => chamar()));

    resultados.forEach((resultado) => expect(resultado).toMatchObject({ status: "error", message: expect.any(String) }));
    expect(mocks.getRolePermissionsMap).toHaveBeenCalledTimes(chamadas.length);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.aggregate).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.listarNotasOmie).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("criarNotaRecebimento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", name: "Ana", email: "ana@vitalscheffer.com.br", role: "FUNCIONARIO" } });
    mocks.getRolePermissionsMap.mockResolvedValue({});
    mocks.canViewRecebimento.mockReturnValue(true);
    mocks.localizarNotaEntradaOmie.mockResolvedValue({
      id: "entrada:10",
      tipo: "Entrada",
      rotuloParceiro: "Fornecedor",
      numero: "123",
      parceiro: "Fornecedor Omie",
      dataEmissao: "14/09/2026",
      valor: 100,
      produtos: [{ descricao: "Produto vindo do Omie", quantidade: 2, unidade: "UN" }],
    });
    mocks.criarNota.mockResolvedValue({
      id: "nota-1",
      numero: "123",
      fornecedor: "Fornecedor Omie",
      dataEmissao: new Date("2026-09-14T03:00:00.000Z"),
      criadoEm: new Date("2026-09-16T12:00:00.000Z"),
      itens: [{ id: "item-1", produto: "Produto vindo do Omie", materialRecebido: false, temOC: false, ocAprovado: false, nfeLancada: false }],
    });
    mocks.audit.mockResolvedValue(undefined);
    mocks.requestHeaders.mockResolvedValue(new Headers());
  });

  it("busca a NF de entrada no Omie e persiste seus dados e produtos", async () => {
    const resultado = await criarNotaRecebimento({ numero: "123" });

    expect(mocks.localizarNotaEntradaOmie).toHaveBeenCalledWith("123");
    expect(mocks.criarNota).toHaveBeenCalledWith({
      data: {
        numero: "123",
        fornecedor: "Fornecedor Omie",
        dataEmissao: new Date("2026-09-14T03:00:00.000Z"),
        criadoPorId: "user-1",
        criadoPorNome: "Ana",
        itens: { create: [{ produto: "Produto vindo do Omie", ordem: 0 }] },
      },
      include: { itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] } },
    });
    expect(resultado).toMatchObject({
      status: "success",
      nota: { id: "nota-1", itens: [{ id: "item-1", produto: "Produto vindo do Omie" }] },
    });
  });
});

describe("buscarNotasOmieRecebimento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", name: "Ana", email: "ana@vitalscheffer.com.br", role: "FUNCIONARIO" } });
    mocks.getRolePermissionsMap.mockResolvedValue({});
    mocks.canViewRecebimento.mockReturnValue(true);
    mocks.listarNotasOmie.mockResolvedValue({ status: "ok", totalEntradas: 1, notas: [], atualizadoEm: "2026-09-15T17:00:00.000Z" });
  });

  it("consulta o Omie somente quando a pessoa autorizada pedir a busca", async () => {
    await expect(buscarNotasOmieRecebimento()).resolves.toMatchObject({ status: "ok", totalEntradas: 1 });

    expect(mocks.listarNotasOmie).toHaveBeenCalledOnce();
  });
});

describe("listarNotasRecebimentoParaExportacao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1", name: "Ana", email: "ana@vitalscheffer.com.br", role: "FUNCIONARIO" } });
    mocks.getRolePermissionsMap.mockResolvedValue({});
    mocks.canViewRecebimento.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([
      {
        id: "nota-1",
        numero: "123",
        fornecedor: "Fornecedor",
        dataEmissao: new Date("2026-09-11T03:00:00.000Z"),
        criadoEm: new Date("2026-09-14T03:00:00.000Z"),
        itens: [{ id: "item-1", produto: "Produto", materialRecebido: true, temOC: false, ocAprovado: false, nfeLancada: false }],
      },
    ]);
  });

  it("busca todas as NFs da semana de inclusão, inclusive fora da página visível", async () => {
    const resultado = await listarNotasRecebimentoParaExportacao({ inicio: "2026-09-14", fim: "2026-09-20" });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { criadoEm: { gte: new Date("2026-09-14T03:00:00.000Z"), lt: new Date("2026-09-20T03:00:00.000Z") } },
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      include: { itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] } },
    });
    expect(resultado).toMatchObject({ status: "success", notas: [{ id: "nota-1", numero: "123" }] });
  });
});

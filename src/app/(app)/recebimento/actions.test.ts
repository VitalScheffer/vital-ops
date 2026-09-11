import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getRolePermissionsMap: vi.fn(),
  canViewRecebimento: vi.fn(),
  findUnique: vi.fn(),
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
    recebimentoNota: { findUnique: mocks.findUnique },
    recebimentoItem: { aggregate: mocks.aggregate, create: mocks.create },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/request", () => ({ requestHeaders: mocks.requestHeaders }));

import { adicionarItemRecebimento } from "./actions";

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

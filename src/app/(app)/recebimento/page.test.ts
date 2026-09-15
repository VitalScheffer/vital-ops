import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getRolePermissionsMap: vi.fn(),
  canViewRecebimento: vi.fn(),
  findMany: vi.fn(),
  listarVendasOmie: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/permissions.server", () => ({ getRolePermissionsMap: mocks.getRolePermissionsMap }));
vi.mock("@/lib/rbac", () => ({ canViewRecebimento: mocks.canViewRecebimento }));
vi.mock("@/lib/db", () => ({ prisma: { recebimentoNota: { findMany: mocks.findMany } } }));
vi.mock("@/lib/recebimento/vendasOmie", () => ({ listarVendasOmie: mocks.listarVendasOmie }));

import RecebimentoPage from "./page";

describe("RecebimentoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { role: "FUNCIONARIO" } });
    mocks.getRolePermissionsMap.mockResolvedValue({});
    mocks.canViewRecebimento.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([]);
    mocks.listarVendasOmie.mockResolvedValue({ status: "ok", total: 0, pedidos: [], atualizadoEm: "2026-09-15T12:00:00.000Z" });
  });

  it("busca uma pagina limitada com ordenacao estavel", async () => {
    const pagina = await RecebimentoPage({ searchParams: Promise.resolve({ pagina: "2" }) });

    expect(mocks.findMany).toHaveBeenCalledWith({
      skip: 50,
      take: 51,
      orderBy: [{ dataEmissao: "desc" }, { id: "desc" }],
      include: { itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] } },
    });
    expect((pagina as unknown as { props: { children: Array<{ key: string }> } }).props.children[1].key).toBe("2");
  });

  it("volta para a primeira pagina quando a query for invalida", async () => {
    await RecebimentoPage({ searchParams: Promise.resolve({ pagina: "100000000000000000000" }) });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 51 }));
  });

  it("nao consulta notas quando a sessao nao tiver permissao", async () => {
    mocks.canViewRecebimento.mockReturnValue(false);

    await RecebimentoPage({ searchParams: Promise.resolve({}) });

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.listarVendasOmie).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getRolePermissionsMap: vi.fn(),
  canViewRecebimento: vi.fn(),
  findMany: vi.fn(),
  obterDataMaisAntigaNotaEntradaOmie: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/permissions.server", () => ({ getRolePermissionsMap: mocks.getRolePermissionsMap }));
vi.mock("@/lib/rbac", () => ({ canViewRecebimento: mocks.canViewRecebimento }));
vi.mock("@/lib/db", () => ({ prisma: { recebimentoNota: { findMany: mocks.findMany } } }));
vi.mock("@/lib/recebimento/notasOmie", () => ({ obterDataMaisAntigaNotaEntradaOmie: mocks.obterDataMaisAntigaNotaEntradaOmie }));

import RecebimentoPage from "./page";

describe("RecebimentoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { role: "FUNCIONARIO" } });
    mocks.getRolePermissionsMap.mockResolvedValue({});
    mocks.canViewRecebimento.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([]);
    mocks.obterDataMaisAntigaNotaEntradaOmie.mockResolvedValue(null);
  });

  it("filtra o mês, respeita a lista escolhida e ordena pela inclusão", async () => {
    const pagina = await RecebimentoPage({ searchParams: Promise.resolve({ pagina: "2", limite: "25", mes: "2026-09" }) });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        criadoEm: {
          gte: new Date("2026-09-01T03:00:00.000Z"),
          lt: new Date("2026-10-01T03:00:00.000Z"),
        },
      },
      skip: 25,
      take: 26,
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      include: { itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] } },
    });
    expect((pagina as unknown as { props: { children: Array<{ key: string }> } }).props.children[2].key).toBe("inclusao:2026-09:25:2");
  });

  it("volta para a primeira pagina quando a query for invalida", async () => {
    await RecebimentoPage({ searchParams: Promise.resolve({ pagina: "100000000000000000000" }) });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 11 }));
  });

  it("nao consulta dados quando a sessao nao tiver permissao", async () => {
    mocks.canViewRecebimento.mockReturnValue(false);

    await RecebimentoPage({ searchParams: Promise.resolve({}) });

    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.obterDataMaisAntigaNotaEntradaOmie).not.toHaveBeenCalled();
  });

  it("filtra pela emissão e não aceita mês anterior à NF mais antiga do Omie", async () => {
    mocks.obterDataMaisAntigaNotaEntradaOmie.mockResolvedValue("15/05/2024");

    await RecebimentoPage({ searchParams: Promise.resolve({ criterio: "emissao", mes: "2024-02" }) });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { dataEmissao: { gte: new Date("2024-05-01T03:00:00.000Z"), lt: new Date("2024-06-01T03:00:00.000Z") } },
      orderBy: [{ dataEmissao: "desc" }, { id: "desc" }],
    }));
  });
});

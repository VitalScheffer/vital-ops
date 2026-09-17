import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ chamar: vi.fn() }));

vi.mock("@/lib/omie", () => ({ chamar: mocks.chamar }));

import { listarNotasOmie, obterDataMaisAntigaNotaEntradaOmie } from "./notasOmie";

describe("listarNotasOmie", () => {
  it("consulta somente NF-e de entrada", async () => {
    mocks.chamar
      .mockResolvedValueOnce({ nTotalRegistros: 826, nTotalPaginas: 34 })
      .mockResolvedValueOnce({
        recebimentos: [{
          cabec: { nIdReceb: 10, cNumeroNFe: "000378364", cRazaoSocial: "Fornecedor", dEmissaoNFe: "14/09/2026", nValorNFe: 82115.14 },
          itensRecebimento: [{ itensCabec: { cDescricaoProduto: "Produto recebido", nQtdeNFe: 4, cUnidadeNfe: "CX" } }],
        }],
      });

    await expect(listarNotasOmie()).resolves.toMatchObject({
      status: "ok",
      totalEntradas: 826,
      notas: [
        {
          id: "entrada:10", numero: "000378364", parceiro: "Fornecedor", dataEmissao: "14/09/2026", valor: 82115.14,
          produtos: [{ descricao: "Produto recebido", quantidade: 4, unidade: "CX" }],
        },
      ],
    });

    expect(mocks.chamar).toHaveBeenNthCalledWith(
      2,
      "produtos/recebimentonfe",
      "ListarRecebimentos",
      expect.objectContaining({ cExibirDetalhes: "S" }),
      expect.any(Object),
    );
    expect(mocks.chamar).toHaveBeenCalledTimes(2);
  });

  it("mantem o checklist manual disponivel se o Omie falhar", async () => {
    mocks.chamar.mockRejectedValueOnce(new Error("indisponível"));
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(listarNotasOmie()).resolves.toEqual({ status: "error", message: "Não foi possível consultar as notas no Omie agora." });

    aviso.mockRestore();
  });

  it("informa a data mais antiga da última página de entradas para limitar o calendário", async () => {
    mocks.chamar
      .mockResolvedValueOnce({ nTotalRegistros: 2, nTotalPaginas: 1 })
      .mockResolvedValueOnce({
        recebimentos: [
          { cabec: { nIdReceb: 1, cNumeroNFe: "1", dEmissaoNFe: "11/05/2024" } },
          { cabec: { nIdReceb: 2, cNumeroNFe: "2", dEmissaoNFe: "17/05/2024" } },
        ],
      });

    await expect(obterDataMaisAntigaNotaEntradaOmie()).resolves.toBe("11/05/2024");
  });
});

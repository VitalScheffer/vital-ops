import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ chamar: vi.fn() }));

vi.mock("@/lib/omie", () => ({ chamar: mocks.chamar }));

import { listarNotasOmie } from "./notasOmie";

describe("listarNotasOmie", () => {
  it("reune NF-e de entrada e de venda na mesma leitura com tipo explicito", async () => {
    mocks.chamar
      .mockResolvedValueOnce({ nTotalRegistros: 826, nTotalPaginas: 34 })
      .mockResolvedValueOnce({
        total_de_registros: 55_993,
        nfCadastro: [{ compl: { nIdNF: 20 }, ide: { nNF: "00049576", dEmi: "15/09/2026" }, nfDestInt: { cRazao: "Cliente" }, total: { ICMSTot: { vNF: 299.99 } } }],
      })
      .mockResolvedValueOnce({
        recebimentos: [{ cabec: { nIdReceb: 10, cNumeroNFe: "000378364", cRazaoSocial: "Fornecedor", dEmissaoNFe: "14/09/2026", nValorNFe: 82115.14 } }],
      });

    await expect(listarNotasOmie()).resolves.toMatchObject({
      status: "ok",
      totalEntradas: 826,
      totalVendas: 55_993,
      notas: [
        { id: "venda:20", tipo: "Venda", numero: "00049576", parceiro: "Cliente", dataEmissao: "15/09/2026", valor: 299.99 },
        { id: "entrada:10", tipo: "Entrada", numero: "000378364", parceiro: "Fornecedor", dataEmissao: "14/09/2026", valor: 82115.14 },
      ],
    });
  });

  it("mantem o checklist manual disponivel se o Omie falhar", async () => {
    mocks.chamar.mockRejectedValueOnce(new Error("indisponível"));
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(listarNotasOmie()).resolves.toEqual({ status: "error", message: "Não foi possível consultar as notas no Omie agora." });

    aviso.mockRestore();
  });
});

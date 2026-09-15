import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ chamar: vi.fn() }));

vi.mock("@/lib/omie", () => ({ chamar: mocks.chamar }));

import { listarVendasOmie } from "./vendasOmie";

describe("listarVendasOmie", () => {
  it("mapeia a pagina mais recente sem persistir pedidos de Vendas", async () => {
    mocks.chamar
      .mockResolvedValueOnce({ cadastros: [{ etapas: [{ cCodigo: "50", cDescricao: "Em Produção" }] }] })
      .mockResolvedValueOnce({ total_de_registros: 72, total_de_paginas: 2 })
      .mockResolvedValueOnce({
        pedido_venda_produto: [
          {
            cabecalho: {
              codigo_pedido: 123,
              numero_pedido: "47808",
              etapa: "50",
              data_previsao: "15/09/2026",
              quantidade_itens: 2,
              origem_pedido: "ERP",
            },
          },
        ],
      });

    await expect(listarVendasOmie()).resolves.toMatchObject({
      status: "ok",
      total: 72,
      pedidos: [{ id: "123", numero: "47808", etapa: "Em Produção", dataPrevisao: "15/09/2026", quantidadeItens: 2, origem: "ERP" }],
    });
    expect(mocks.chamar).toHaveBeenCalledWith(
      "produtos/pedido",
      "ListarPedidos",
      { pagina: 2, registros_por_pagina: 50, apenas_resumo: "S", ordenar_por: "CODIGO" },
      { ttlSeconds: 300 },
    );
  });

  it("mantem o Recebimento disponivel se o Omie falhar", async () => {
    mocks.chamar.mockRejectedValueOnce(new Error("indisponível"));
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(listarVendasOmie()).resolves.toEqual({ status: "error", message: "Não foi possível consultar Vendas no Omie agora." });

    aviso.mockRestore();
  });
});

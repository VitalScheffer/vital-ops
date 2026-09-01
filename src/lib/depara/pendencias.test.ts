import { describe, expect, it, vi } from "vitest";

import type { ChamarFn } from "@/lib/estoque/omieEstoque";
import { comprasQueUsam, conferirPendencias, opsQueUsam, temPendencia } from "./pendencias";

// Recorte fiel de uma resposta real do ListarOrdemProducao. A OP 2024/00475
// está CONCLUÍDA e usa o mesmo material: ela não é pendência.
const RESPOSTA_OP = {
  pagina: 1,
  total_de_paginas: 1,
  cadastros: [
    {
      identificacao: {
        cNumOP: "2026/00801",
        nCodOP: 12172431727,
        nCodProduto: 12099267307,
        nQtde: 10,
        dDtPrevisao: "31/08/2026",
      },
      outrasInf: { cConcluida: "N" },
      itensDetalhes: [
        { nIdProdutoMalha: 12128056162, nQtde: 10, cReservado: "N" },
        { nIdProdutoMalha: 8723549209, nQtde: 4, cReservado: "S" },
        // MESMO material de novo, em outra peça da OP: a lista de pendência
        // conta a ORDEM uma vez, não a linha.
        { nIdProdutoMalha: 8723549209, nQtde: 2, cReservado: "N" },
      ],
    },
    {
      identificacao: { cNumOP: "2024/00475", nCodOP: 8755550541, nCodProduto: 5781052017, nQtde: 1 },
      outrasInf: { cConcluida: "S" },
      itensDetalhes: [{ nIdProdutoMalha: 8723549209, nQtde: 99, cReservado: "N" }],
    },
  ],
};

function chamarFake(por: Record<string, unknown>): ChamarFn {
  return vi.fn(async (_path: string, call: string) => (por[call] ?? null) as never);
}

describe("opsQueUsam", () => {
  it("acha a OP aberta que consome o código e ignora a concluída", async () => {
    const ops = await opsQueUsam("8723549209", chamarFake({ ListarOrdemProducao: RESPOSTA_OP }));

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ numero: "2026/00801", quantidade: 4, reservado: true });
  });

  it("código que nenhuma OP aberta usa não vira pendência", async () => {
    const ops = await opsQueUsam("999", chamarFake({ ListarOrdemProducao: RESPOSTA_OP }));
    expect(ops).toEqual([]);
  });
});

describe("comprasQueUsam", () => {
  it("resposta vazia do Omie (null) não vira pendência inventada", async () => {
    // É o estado real desta base em 01/09/2026: o PesquisarPedCompra responde
    // "não existem registros", que o client traduz para null.
    const compras = await comprasQueUsam("8723549209", chamarFake({}));
    expect(compras).toEqual([]);
  });

  it("acha o pedido em aberto com o produto e pula o já recebido", async () => {
    const resposta = {
      total_de_paginas: 1,
      pedido_compra_produto: [
        {
          cabecalho: { numero: "1042", codigo_situacao: "20", data_previsao: "10/09/2026" },
          produtos: [{ codigo_produto: 8723549209, quantidade: 12 }],
        },
        {
          cabecalho: { numero: "1030", codigo_situacao: "50" },
          produtos: [{ codigo_produto: 8723549209, quantidade: 5 }],
        },
      ],
    };
    const compras = await comprasQueUsam("8723549209", chamarFake({ PesquisarPedCompra: resposta }));

    expect(compras).toHaveLength(1);
    expect(compras[0]).toMatchObject({ numero: "1042", quantidade: 12 });
  });
});

describe("conferirPendencias", () => {
  it("junta OP, compra e requisição do nosso banco", async () => {
    const p = await conferirPendencias(
      {
        idProd: "8723549209",
        requisicoes: [{ numero: 41, solicitante: "Vitor", quantidade: 2, status: "PENDENTE" }],
      },
      chamarFake({ ListarOrdemProducao: RESPOSTA_OP }),
    );

    expect(p.ops).toHaveLength(1);
    expect(p.requisicoes).toHaveLength(1);
    expect(p.incompleto).toBe(false);
    expect(temPendencia(p)).toBe(true);
  });

  it("uma leitura que falha NÃO apaga as outras, e a conferência se declara incompleta", async () => {
    // Lista incompleta apresentada como completa é pior do que nenhuma: ela
    // autoriza a migração dizendo "não tem nada aberto" quando ninguém olhou.
    const chamar: ChamarFn = vi.fn(async (_path: string, call: string) => {
      if (call === "ListarOrdemProducao") throw new Error("Omie fora do ar");
      return null as never;
    });

    const p = await conferirPendencias(
      { idProd: "8723549209", requisicoes: [{ numero: 7, solicitante: "Hiro", quantidade: 1, status: "PENDENTE" }] },
      chamar,
    );

    expect(p.ops).toEqual([]);
    expect(p.requisicoes).toHaveLength(1);
    expect(p.incompleto).toBe(true);
    expect(p.avisos[0]).toContain("ordens de produção");
  });

  it("sem nada aberto, temPendencia é falso", async () => {
    const p = await conferirPendencias({ idProd: "999", requisicoes: [] }, chamarFake({ ListarOrdemProducao: RESPOSTA_OP }));
    expect(temPendencia(p)).toBe(false);
  });
});

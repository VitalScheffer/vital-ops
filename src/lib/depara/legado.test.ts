import { describe, expect, it, vi } from "vitest";

import type { ChamarFn } from "@/lib/estoque/omieEstoque";
import { listarLegadosComSaldo } from "./legado";

// Id interno numérico, como o Omie devolve (`nCodProd`/`codigo_produto`).
const IDS: Record<string, number> = {
  PRD00620: 8603307554,
  PRD00621: 8603307555,
  PRD00016: 5754851177,
  PRD02564: 8750925196,
  "MATCH 00090 IN430": 12128056828,
};

// Uma linha de posição de estoque como o ListarPosEstoque devolve.
function posicao(codigo: string, descricao: string, saldo = 10) {
  return { cCodigo: codigo, cDescricao: descricao, nCodProd: IDS[codigo], nSaldo: saldo, nCMC: 3.2 };
}

// Um cadastro como o ListarProdutos devolve.
function cadastro(codigo: string, opcoes: { inativo?: string; bloqueado?: string; unidade?: string } = {}) {
  return {
    codigo_produto: IDS[codigo],
    codigo,
    descricao: codigo,
    unidade: opcoes.unidade ?? "M²",
    descricao_familia: "MATÉRIA-PRIMA",
    inativo: opcoes.inativo ?? "N",
    bloqueado: opcoes.bloqueado ?? "N",
  };
}

/**
 * `chamar` falso que responde a posição de estoque e o cadastro de produtos.
 * A resposta de produtos é montada a partir dos ids pedidos, como a API real.
 */
function chamarFalso(
  produtos: readonly ReturnType<typeof posicao>[],
  cadastros: readonly ReturnType<typeof cadastro>[],
): ReturnType<typeof vi.fn<ChamarFn>> {
  return vi.fn<ChamarFn>(async (path, call, param) => {
    if (call === "ListarPosEstoque") {
      return { produtos, nTotPaginas: 1 };
    }
    if (call === "ListarProdutos") {
      const pedidos = new Set(
        ((param.produtosPorCodigo as { codigo_produto: unknown }[]) ?? []).map((p) => String(p.codigo_produto)),
      );
      return {
        produto_servico_cadastro: cadastros.filter((c) => pedidos.has(String(c.codigo_produto))),
      };
    }
    throw new Error(`chamada inesperada: ${path} ${call}`);
  });
}

const CHAPA = "CHAPA 0,90 X 1200 X 2000 MM ACO INOX 430";

describe("listarLegadosComSaldo", () => {
  it("traz o legado ativo com a unidade lida do cadastro", async () => {
    const chamar = chamarFalso([posicao("PRD00620", CHAPA, 240)], [cadastro("PRD00620", { unidade: "M²" })]);

    const itens = await listarLegadosComSaldo("5940905787", "31/08/2026", chamar);

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ codigo: "PRD00620", saldo: 240, unidade: "M²" });
  });

  it("descarta cadastro INATIVO, mesmo com saldo", async () => {
    const chamar = chamarFalso(
      [posicao("PRD00620", CHAPA, 240), posicao("PRD00621", CHAPA, 99)],
      [cadastro("PRD00620"), cadastro("PRD00621", { inativo: "S" })],
    );

    const itens = await listarLegadosComSaldo("5940905787", "31/08/2026", chamar);
    expect(itens.map((i) => i.codigo)).toEqual(["PRD00620"]);
  });

  it("descarta cadastro BLOQUEADO", async () => {
    const chamar = chamarFalso(
      [posicao("PRD00621", CHAPA, 99)],
      [cadastro("PRD00621", { bloqueado: "S" })],
    );
    expect(await listarLegadosComSaldo("5940905787", "31/08/2026", chamar)).toEqual([]);
  });

  it("cadastro que não volta do Omie fica de fora (não dá para afirmar que está ativo)", async () => {
    const chamar = chamarFalso([posicao("PRD00620", CHAPA, 240)], []);
    expect(await listarLegadosComSaldo("5940905787", "31/08/2026", chamar)).toEqual([]);
  });

  it("código no padrão novo nem chega a ser consultado", async () => {
    const chamar = chamarFalso([posicao("MATCH 00090 IN430", "CHAPA ESP 0,90 AÇO INOX 430", 50)], []);

    const itens = await listarLegadosComSaldo("5940905787", "31/08/2026", chamar);

    expect(itens).toEqual([]);
    // Só a posição de estoque: sem candidato, não gasta leitura de cadastro.
    expect(chamar).toHaveBeenCalledTimes(1);
  });

  it("descrição que não é matéria-prima nem chega a ser consultada", async () => {
    const chamar = chamarFalso([posicao("PRD00016", "CANETA ESFEROGRAFICA AZUL", 50)], []);

    expect(await listarLegadosComSaldo("5940905787", "31/08/2026", chamar)).toEqual([]);
    expect(chamar).toHaveBeenCalledTimes(1);
  });

  it("o código na frente da descrição não vira medida", async () => {
    // "CREHI PC002 CCPTD" é padrão novo e sai pelo primeiro filtro; este caso
    // cobre o legado com dígitos no código e a palavra CHAPA na descrição.
    const chamar = chamarFalso(
      [posicao("PRD02564", "GRADE LATERAL - CAMA 2MOV", 12)],
      [cadastro("PRD02564")],
    );
    expect(await listarLegadosComSaldo("5940905787", "31/08/2026", chamar)).toEqual([]);
  });
});

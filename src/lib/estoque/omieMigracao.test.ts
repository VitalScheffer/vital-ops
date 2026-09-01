import { describe, expect, it, vi } from "vitest";

import { OmieBlocked, OmieDuplicate, OmieError } from "@/lib/omie/errors";
import type { ChamarFn, ProdutoEstoque, SaldoEstoque } from "./omieEstoque";
import { migrarSaldo, novoAceitaEntrada, type ContextoMigracao, type ItemMigracao } from "./omieMigracao";

const LEGADO: ProdutoEstoque = { idProd: "8723549209", descricao: "PRD00620 - CHAPA 0,90 INOX" };
const NOVO: ProdutoEstoque = { idProd: "12098285735", descricao: "MATCH 00090 IN430" };

// Matéria-Prima e Reservado Produção, os dois locais reais desta base.
const MP = "5940905787";
const PROD = "12170621031";

function ctx(saldos: Record<string, SaldoEstoque>, extra: Partial<ContextoMigracao> = {}): ContextoMigracao {
  return {
    data: "01/09/2026",
    legado: LEGADO,
    novo: NOVO,
    saldos: new Map(Object.entries(saldos)),
    ...extra,
  };
}

function item(parcial: Partial<ItemMigracao> = {}): ItemMigracao {
  return {
    chave: "item-1",
    localCodigo: MP,
    quantidadeLegado: 240,
    quantidadeNovo: 1694.9153,
    obs: "Migração PRD00620 → MATCH 00090 IN430",
    ...parcial,
  };
}

describe("novoAceitaEntrada", () => {
  it("recusa cadastro novo com controle de lote", () => {
    // O ajuste de ENTRADA do Omie só aponta para lote que já existe, e não cria
    // lote. Lançar sem lote produziria saldo que a fábrica não consegue baixar.
    const r = novoAceitaEntrada({ ...NOVO, controleLote: true });

    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("controle de lote");
  });

  it("aceita cadastro novo sem controle de lote", () => {
    expect(novoAceitaEntrada(NOVO).ok).toBe(true);
  });
});

describe("migrarSaldo", () => {
  it("cada local vira uma saída no antigo e uma entrada no novo, no MESMO local", async () => {
    const chamadas: Record<string, unknown>[] = [];
    const chamar: ChamarFn = vi.fn(async (_p, _c, param) => {
      chamadas.push(param as Record<string, unknown>);
      return { id_ajuste: `aj-${chamadas.length}` };
    });

    const r = await migrarSaldo([item()], ctx({ [MP]: { saldo: 240, cmc: 12.5 } }), chamar);

    expect(r.itens[0].outcome).toBe("migrado");
    expect(chamadas).toHaveLength(2);

    const [saida, entrada] = chamadas;
    expect(saida).toMatchObject({
      id_prod: 8723549209,
      tipo: "SAI",
      quan: 240,
      codigo_local_estoque: Number(MP),
      cod_int_ajuste: "item-1-ms",
    });
    expect(entrada).toMatchObject({
      id_prod: 12098285735,
      tipo: "ENT",
      quan: 1694.9153,
      codigo_local_estoque: Number(MP),
      cod_int_ajuste: "item-1-me",
    });
  });

  it("o valor das duas pernas sai do CMC do ANTIGO, para o total não mudar", async () => {
    // Usar o CMC do cadastro novo (que pode ser zero, ou de outra unidade) na
    // entrada inventaria ou apagaria valor numa troca de etiqueta.
    const chamadas: Record<string, unknown>[] = [];
    const chamar: ChamarFn = vi.fn(async (_p, _c, param) => {
      chamadas.push(param as Record<string, unknown>);
      return { id_ajuste: "x" };
    });

    await migrarSaldo([item({ quantidadeLegado: 10, quantidadeNovo: 70 })], ctx({ [MP]: { saldo: 10, cmc: 3.3 } }), chamar);

    expect(chamadas[0].valor).toBe(33);
    expect(chamadas[1].valor).toBe(33);
  });

  it("saldo insuficiente no local nem vira chamada ao Omie", async () => {
    const chamar: ChamarFn = vi.fn(async () => ({ id_ajuste: "x" }));

    const r = await migrarSaldo([item({ quantidadeLegado: 240 })], ctx({ [MP]: { saldo: 3, cmc: 1 } }), chamar);

    expect(r.itens[0].outcome).toBe("falha");
    expect(r.itens[0].motivo).toContain("Saldo insuficiente");
    expect(chamar).not.toHaveBeenCalled();
  });

  it("saída OK e entrada com erro vira entrada_pendente, nunca falha", async () => {
    // Repetir do zero tiraria saldo de novo do cadastro antigo. O estado
    // próprio é o que permite a retomada mandar só a entrada.
    const chamar: ChamarFn = vi.fn(async (_p, _c, param) => {
      if ((param as { tipo?: string }).tipo === "ENT") throw new OmieError("deu ruim");
      return { id_ajuste: "saida-1" };
    });

    const r = await migrarSaldo([item()], ctx({ [MP]: { saldo: 240, cmc: 1 } }), chamar);

    expect(r.itens[0].outcome).toBe("entrada_pendente");
    expect(r.itens[0].refSaida).toBe("saida-1");
  });

  it("retomada com saidaFeita manda só a entrada", async () => {
    const chamadas: Record<string, unknown>[] = [];
    const chamar: ChamarFn = vi.fn(async (_p, _c, param) => {
      chamadas.push(param as Record<string, unknown>);
      return { id_ajuste: "entrada-1" };
    });

    // Saldo do local já está descontado pela saída anterior: conferir de novo
    // reprovaria justamente o item que precisa ser concluído.
    const r = await migrarSaldo([item({ saidaFeita: true })], ctx({ [MP]: { saldo: 0, cmc: 1 } }), chamar);

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ tipo: "ENT" });
    expect(r.itens[0].outcome).toBe("migrado");
  });

  it("duplicado nas duas pernas = já migrado antes, não erro", async () => {
    const chamar: ChamarFn = vi.fn(async () => {
      throw new OmieDuplicate("já cadastrado");
    });

    const r = await migrarSaldo([item()], ctx({ [MP]: { saldo: 240, cmc: 1 } }), chamar);

    expect(r.itens[0].outcome).toBe("ja_migrado");
  });

  it("bloqueio do Omie interrompe e o resto sai como não migrado", async () => {
    const chamar: ChamarFn = vi.fn(async () => {
      throw new OmieBlocked("consumo indevido");
    });

    const r = await migrarSaldo(
      [item({ chave: "a", localCodigo: MP }), item({ chave: "b", localCodigo: PROD })],
      ctx({ [MP]: { saldo: 240, cmc: 1 }, [PROD]: { saldo: 10, cmc: 1 } }),
      chamar,
    );

    expect(r.bloqueado).toBe(true);
    expect(r.interrompido).toBe(true);
    expect(r.itens.map((i) => i.outcome)).toEqual(["nao_migrado", "nao_migrado"]);
  });

  it("cadastro novo com lote reprova TUDO antes de escrever qualquer coisa", async () => {
    const chamar: ChamarFn = vi.fn(async () => ({ id_ajuste: "x" }));

    const r = await migrarSaldo(
      [item()],
      ctx({ [MP]: { saldo: 240, cmc: 1 } }, { novo: { ...NOVO, controleLote: true } }),
      chamar,
    );

    expect(r.itens[0].outcome).toBe("falha");
    expect(chamar).not.toHaveBeenCalled();
  });

  it("antigo com controle de lote aloca FEFO na saída", async () => {
    const chamadas: Record<string, unknown>[] = [];
    const chamar: ChamarFn = vi.fn(async (_p, _c, param) => {
      chamadas.push(param as Record<string, unknown>);
      return { id_ajuste: "x" };
    });

    const r = await migrarSaldo(
      [item({ quantidadeLegado: 15, quantidadeNovo: 15 })],
      ctx(
        { [MP]: { saldo: 20, cmc: 1 } },
        {
          legado: { ...LEGADO, controleLote: true },
          lotes: new Map([
            [
              MP,
              [
                { nIdLote: "2", numero: "B", disponivel: 10, saldoFisico: 10, validade: "01/12/2026" },
                { nIdLote: "1", numero: "A", disponivel: 10, saldoFisico: 10, validade: "01/10/2026" },
              ],
            ],
          ]),
        },
      ),
      chamar,
    );

    expect(r.itens[0].outcome).toBe("migrado");
    // Vence antes sai antes: 10 do lote 1, 5 do lote 2.
    expect(chamadas[0].lote_validade).toEqual([
      { nIdLote: 1, nQtdLote: 10 },
      { nIdLote: 2, nQtdLote: 5 },
    ]);
    // A ENTRADA no código novo não carrega lote: é outro produto.
    expect(chamadas[1].lote_validade).toBeUndefined();
  });

  it("antigo com lote sem disponibilidade não sai do lugar", async () => {
    const chamar: ChamarFn = vi.fn(async () => ({ id_ajuste: "x" }));

    const r = await migrarSaldo(
      [item({ quantidadeLegado: 15 })],
      ctx(
        { [MP]: { saldo: 20, cmc: 1 } },
        {
          legado: { ...LEGADO, controleLote: true },
          lotes: new Map([[MP, [{ nIdLote: "1", numero: "A", disponivel: 4, saldoFisico: 20 }]]]),
        },
      ),
      chamar,
    );

    expect(r.itens[0].outcome).toBe("falha");
    expect(r.itens[0].motivo).toContain("lote");
    expect(chamar).not.toHaveBeenCalled();
  });
});

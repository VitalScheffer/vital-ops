import { describe, expect, it } from "vitest";

import {
  resumoRelatorio,
  statusItemLabel,
  statusRequisicaoLabel,
  quantidadeComUnidade,
  quantidadeTexto,
  type RequisicaoRelatorio,
} from "./relatorio";

const APROVADA: RequisicaoRelatorio = {
  numero: 7,
  status: "CONFIRMADA",
  solicitanteNome: "Fulano",
  setor: "Fábrica",
  criadoEm: "15/07/2026 09:00",
  gestor: "Gestora",
  decididaEm: "15/07/2026 10:00",
  motivoDecisao: null,
  localEstoqueNome: "Estoque de Matéria-Prima",
  itens: [
    { sku: "MAT 001", descricao: "Fita", quantidade: 2, status: "BAIXADO", motivoErro: null },
    { sku: "MAT 002", descricao: "Cola", quantidade: 1, status: "FALHA", motivoErro: "Saldo insuficiente" },
  ],
};

const RECUSADA: RequisicaoRelatorio = {
  numero: 8,
  status: "RECUSADA",
  solicitanteNome: "Ciclano",
  setor: "Almoxarifado",
  criadoEm: "16/07/2026 08:00",
  gestor: "Gestora",
  decididaEm: "16/07/2026 08:30",
  motivoDecisao: "Item errado",
  localEstoqueNome: null,
  itens: [{ sku: "MAT 003", descricao: "Papel", quantidade: 5, status: "PENDENTE", motivoErro: null }],
};

const PENDENTE: RequisicaoRelatorio = { ...RECUSADA, numero: 9, status: "PENDENTE" };

// Excluída (soft delete) que ANTES tinha sido aprovada: o status guarda a
// decisão, a flag `cancelada` diz que o pedido foi excluído.
const EXCLUIDA: RequisicaoRelatorio = {
  ...APROVADA,
  numero: 10,
  cancelada: true,
  canceladaPor: "Gestor da Fábrica",
  canceladaEm: "17/07/2026 11:00",
  motivoCancelamento: "Pedido duplicado",
};

describe("resumoRelatorio", () => {
  it("conta total, aprovadas, recusadas e o resto como aguardando", () => {
    expect(resumoRelatorio([APROVADA, RECUSADA, PENDENTE])).toEqual({
      total: 3,
      aprovadas: 1,
      recusadas: 1,
      excluidas: 0,
      pendentes: 1,
    });
  });

  it("excluída conta só como excluída, mesmo tendo sido aprovada antes", () => {
    expect(resumoRelatorio([APROVADA, EXCLUIDA])).toEqual({
      total: 2,
      aprovadas: 1,
      recusadas: 0,
      excluidas: 1,
      pendentes: 0,
    });
  });

  it("lista vazia zera tudo", () => {
    expect(resumoRelatorio([])).toEqual({
      total: 0,
      aprovadas: 0,
      recusadas: 0,
      excluidas: 0,
      pendentes: 0,
    });
  });
});

describe("rótulos", () => {
  it("status da requisição em pt-BR (desconhecido passa direto)", () => {
    expect(statusRequisicaoLabel("CONFIRMADA")).toBe("Aprovada");
    expect(statusRequisicaoLabel("RECUSADA")).toBe("Recusada");
    expect(statusRequisicaoLabel("PENDENTE")).toBe("Aguardando gestor");
    expect(statusRequisicaoLabel("XPTO")).toBe("XPTO");
  });

  it("status do item e quantidade formatada", () => {
    expect(statusItemLabel("BAIXADO")).toBe("baixado");
    expect(statusItemLabel("FALHA")).toBe("falha");
    expect(quantidadeTexto(1500)).toBe("1.500");
  });

  it("quantidade com a unidade do Omie ao lado (sem unidade, só o número)", () => {
    expect(quantidadeComUnidade(1500, "KG")).toBe("1.500 KG");
    expect(quantidadeComUnidade(2, "M3")).toBe("2 M3");
    expect(quantidadeComUnidade(2, null)).toBe("2");
    expect(quantidadeComUnidade(2, "  ")).toBe("2");
  });
});

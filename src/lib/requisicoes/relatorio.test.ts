import { describe, expect, it } from "vitest";

import { montarLinhasRelatorio, type RequisicaoRelatorio } from "./relatorio";

const PERIODO = { de: "01/07/2026", ate: "16/07/2026" };

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

describe("montarLinhasRelatorio", () => {
  it("cabeçalho traz período, geração e totais por status", () => {
    const linhas = montarLinhasRelatorio([APROVADA, RECUSADA], PERIODO, "16/07/2026 11:00");
    expect(linhas[0].texto).toContain("Relatório de Requisições");
    expect(linhas[1].texto).toContain("01/07/2026 a 16/07/2026");
    expect(linhas[1].texto).toContain("16/07/2026 11:00");
    expect(linhas[2].texto).toContain("2 pedido(s)");
    expect(linhas[2].texto).toContain("1 aprovado(s)");
    expect(linhas[2].texto).toContain("1 recusado(s)");
  });

  it("bloco da aprovada: número formatado, gestor, local da baixa e itens com situação/erro", () => {
    const textos = montarLinhasRelatorio([APROVADA], PERIODO, "x").map((l) => l.texto);
    expect(textos).toContainEqual(expect.stringContaining("REQ-0007 — Aprovada"));
    expect(textos).toContainEqual(expect.stringContaining("Aprovada por Gestora em 15/07/2026 10:00"));
    expect(textos).toContainEqual(expect.stringContaining("baixa no local Estoque de Matéria-Prima"));
    expect(textos).toContainEqual(expect.stringContaining("MAT 001 — Fita — qtd 2 — baixado"));
    expect(textos).toContainEqual(expect.stringContaining("MAT 002 — Cola — qtd 1 — falha (Saldo insuficiente)"));
  });

  it("bloco da recusada traz o motivo", () => {
    const textos = montarLinhasRelatorio([RECUSADA], PERIODO, "x").map((l) => l.texto);
    expect(textos).toContainEqual(expect.stringContaining("REQ-0008 — Recusada"));
    expect(textos).toContainEqual(expect.stringContaining("motivo: Item errado"));
  });

  it("período sem requisições avisa em vez de sair vazio", () => {
    const textos = montarLinhasRelatorio([], PERIODO, "x").map((l) => l.texto);
    expect(textos).toContainEqual("Nenhuma requisição no período.");
  });
});

import { describe, expect, it } from "vitest";

import type { RequisicaoRelatorio } from "./relatorio";
import { gerarRelatorioPdf } from "./relatorioPdf";

const PERIODO = { de: "01/07/2026", ate: "16/07/2026" };

const APROVADA: RequisicaoRelatorio = {
  numero: 7,
  status: "CONFIRMADA",
  solicitanteNome: "Fulano da Silva",
  setor: "Fábrica",
  criadoEm: "15/07/2026 09:00",
  gestor: "Gestora",
  decididaEm: "15/07/2026 10:00",
  motivoDecisao: null,
  localEstoqueNome: "Estoque de Matéria-Prima",
  itens: [
    { sku: "MAT 001", descricao: "Fita demarcação zebrada (preto e amarelo) 30m", quantidade: 2, status: "BAIXADO", motivoErro: null },
    { sku: "MAT 002", descricao: "Cola", quantidade: 1, status: "FALHA", motivoErro: "Saldo insuficiente neste local" },
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

function ehPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

describe("gerarRelatorioPdf", () => {
  it("gera um PDF válido e não vazio com requisições", async () => {
    const bytes = await gerarRelatorioPdf([APROVADA, RECUSADA], PERIODO, "16/07/2026 11:00");
    expect(ehPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("gera PDF mesmo com período sem requisições", async () => {
    const bytes = await gerarRelatorioPdf([], PERIODO, "16/07/2026 11:00");
    expect(ehPdf(bytes)).toBe(true);
  });

  it("aguenta descrição com caractere fora do WinAnsi e muitos itens (várias páginas)", async () => {
    const exotica: RequisicaoRelatorio = {
      ...APROVADA,
      numero: 99,
      itens: Array.from({ length: 60 }, (_, i) => ({
        sku: `MAT ${i}`,
        descricao: `Peça ✓ 日本 número ${i}`,
        quantidade: i + 1,
        status: i % 3 === 0 ? "FALHA" : "BAIXADO",
        motivoErro: i % 3 === 0 ? "erro exótico ✓" : null,
      })),
    };
    const bytes = await gerarRelatorioPdf([exotica], PERIODO, "x");
    expect(ehPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(2000);
  });
});
